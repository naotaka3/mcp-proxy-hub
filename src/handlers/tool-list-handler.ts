import { ConnectedClient } from '../client.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ServerConfigs } from '../config.js';

/**
 * Handles a request to list tools from all connected clients
 */
export async function handleListToolsRequest(
  request: {
    method: 'tools/list';
    params?: {
      _meta?: {
        progressToken?: string | number;
        [key: string]: unknown;
      };
      cursor?: string;
    };
  },
  connectedClients: ConnectedClient[],
  serverConfigs: ServerConfigs,
  toolsConfig?: {
    mcpServers: Record<string, unknown>;
    tools?: Record<
      string,
      {
        description: string;
        subtools?: Record<
          string,
          {
            tools: Array<{
              name: string;
              description?: string;
            }>;
          }
        >;
      }
    >;
  }
): Promise<{ tools: Tool[] }> {
  const exposedTools: Tool[] = [];
  const allTools: (Tool & { serverName: string })[] = [];

  // Clear the existing tool map
  clientMaps.clearToolMap();

  // First, collect tools from all connected MCP servers
  for (const connectedClient of connectedClients) {
    try {
      // Get server config for tool filtering
      const serverConfig = serverConfigs[connectedClient.name];

      // Fetch tools from the client
      const clientAllTools = await toolService.fetchToolsFromClient(
        connectedClient,
        serverConfig,
        request.params?._meta
      );

      const filteredTools = toolService.filterTools(clientAllTools, serverConfig);

      exposedTools.push(...filteredTools);

      if (clientAllTools.length > 0) {
        allTools.push(
          ...clientAllTools.map((tool) => ({ ...tool, serverName: connectedClient.name }))
        );
      }
    } catch (error) {
      console.error(`Error fetching tools from client ${connectedClient.name}:`, error);
      // Continue with other clients even if one fails
    }
  }

  // Then, add custom tools from config
  try {
    const customTools = customToolService.createCustomTools(
      toolsConfig,
      connectedClients,
      allTools
    );
    exposedTools.push(...customTools);
  } catch (error) {
    console.error('Error creating custom tools:', error);
  }

  return { tools: exposedTools };
}
