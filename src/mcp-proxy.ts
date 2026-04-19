import { createClients, getConnectedClient } from './client.js';
import { loadConfig } from './config.js';
import {
  handleListToolsRequest,
  handleToolCall,
  handleGetPromptRequest,
  handleListPromptsRequest,
  registerListResourcesHandler,
  registerListResourceTemplatesHandler,
  registerReadResourceHandler,
} from './handlers/index.js';
import { setupEventSource, createMCPServer, createCleanupFunction } from './core/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

let cachedConfig: Awaited<ReturnType<typeof loadConfig>> | null = null;

/**
 * Initializes backend client connections by loading config and connecting to servers.
 * Call this once at startup, then use createProxyServer() for each session.
 */
export const initClients = async () => {
  setupEventSource();
  cachedConfig = await loadConfig();
  await createClients(cachedConfig.mcpServers);
  return cachedConfig;
};

/**
 * Creates a new MCP proxy server instance with handlers wired to shared backend clients.
 * Backend clients must already be initialized via initClients().
 * Each call creates a fresh Server — safe to use per HTTP session.
 */
export const createProxyServer = () => {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call initClients() first.');
  }
  const config = cachedConfig;

  const server = createMCPServer();

  server.setRequestHandler(ListToolsRequestSchema, (request) => {
    const connectedClients = getConnectedClient();
    return handleListToolsRequest(request, connectedClients, config.mcpServers || {}, {
      mcpServers: config.mcpServers || {},
      tools: config.tools,
    });
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await handleToolCall(request, config);
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return handleGetPromptRequest(request);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const connectedClients = getConnectedClient();
    return handleListPromptsRequest(request, connectedClients);
  });

  registerListResourcesHandler(server);
  registerReadResourceHandler(server);
  registerListResourceTemplatesHandler(server);

  return server;
};

/**
 * Returns a cleanup function for backend client connections.
 */
export const createBackendCleanup = createCleanupFunction;

/**
 * Creates an MCP proxy server AND initializes backend connections.
 * Kept for backward compatibility with stdio and SSE transports.
 * @returns The server and cleanup function
 */
export const createServer = async () => {
  await initClients();
  const server = createProxyServer();
  const cleanup = createBackendCleanup();
  return { server, cleanup };
};
