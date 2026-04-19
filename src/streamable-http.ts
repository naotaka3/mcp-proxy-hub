#!/usr/bin/env node

import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { initClients, createProxyServer, createBackendCleanup } from './mcp-proxy.js';
import { loadConfig } from './config.js';
import 'dotenv/config';

const app = express();

app.use(cors());

interface Session {
  server: ReturnType<typeof createProxyServer>;
  transport: StreamableHTTPServerTransport;
}

async function main() {
  const config = await loadConfig();

  // Initialize backend client connections once at startup.
  // Each HTTP session gets its own Server instance but shares these connections.
  await initClients();
  const backendCleanup = createBackendCleanup();

  // Map to store sessions by session ID for stateful mode.
  const sessions = new Map<string, Session>();

  // Bearer token auth middleware
  const authToken = config.serverTransport?.auth?.token || process.env.MCP_PROXY_AUTH_TOKEN;
  if (authToken) {
    app.use((req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization || authorization !== `Bearer ${authToken}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });
    console.log('Bearer token authentication enabled');
  }

  const mcpPath = config.serverTransport?.path || process.env.MCP_PROXY_PATH || '/mcp';

  function getSessionId(req: express.Request): string | undefined {
    const value = req.headers['mcp-session-id'];
    return typeof value === 'string' ? value : undefined;
  }

  // Handle POST requests for client-to-server communication
  app.post(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);

    // Check for existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }

    // New session - create a fresh server instance and transport.
    // The server shares the same backend client connections.
    const server = createProxyServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        const session = sessions.get(transport.sessionId);
        if (session) {
          session.server.close().catch(() => {});
          sessions.delete(transport.sessionId);
        }
      }
    };

    await server.connect(transport);

    await transport.handleRequest(req, res);

    // Store session AFTER handleRequest, since sessionId is set during request processing.
    if (transport.sessionId) {
      sessions.set(transport.sessionId, { server, transport });
    }
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete(mcpPath, async (req, res) => {
    const sessionId = getSessionId(req);
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const session = sessions.get(sessionId)!;
    await session.transport.close();
    await session.server.close().catch(() => {});
    sessions.delete(sessionId);
    res.status(200).json({ message: 'Session terminated' });
  });

  const PORT = config.serverTransport?.port || Number(process.env.PORT) || 3006;
  const HOST = config.serverTransport?.host || process.env.HOST || '0.0.0.0';

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Streamable HTTP server running at http://${HOST}:${PORT}${mcpPath}`);
  });

  async function exit() {
    console.log('Shutting down...');
    // Close all active sessions
    for (const [, session] of sessions) {
      await session.transport.close().catch(() => {});
      await session.server.close().catch(() => {});
    }
    sessions.clear();
    // Close backend client connections
    await backendCleanup();
    httpServer.close();
    process.exit(0);
  }

  process.on('SIGINT', exit);
  process.on('SIGTERM', exit);
}

main().catch((error) => {
  console.error('Error during server startup:', error);
  process.exit(1);
});
