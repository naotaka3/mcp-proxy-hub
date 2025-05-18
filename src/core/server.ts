import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getConnectedClient } from '../client.js';
import * as eventsource from 'eventsource';

/**
 * Sets up the global EventSource for SSE communication
 */
export function setupEventSource(): void {
  global.EventSource = eventsource.EventSource;
}

/**
 * Creates a new MCP server instance
 * @returns The server instance
 */
export function createMCPServer(): Server {
  return new Server(
    {
      name: 'mcp-proxy-hub',
      version: '1.0.0',
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    }
  );
}

/**
 * Performs cleanup operations when shutting down
 * @param connectedClients The list of connected clients
 * @returns Cleanup function
 */
export function createCleanupFunction(): () => Promise<void> {
  return async () => {
    const connectedClients = getConnectedClient();
    await Promise.all(
      connectedClients.map(async (client) => {
        try {
          await client.cleanup();
        } catch (error) {
          console.error(`Error during cleanup for client ${client.name}:`, error);
        }
      })
    );
  };
}
