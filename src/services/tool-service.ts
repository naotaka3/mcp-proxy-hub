import { ConnectedClient } from '../client.js';
import {
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerConfig } from '../config.js';
import { clientMaps } from '../mappers/client-maps.js';
import {
  logServerToolRequest,
  logServerToolResponse,
  logServerToolError,
} from '../utils/debug-utils.js';

export class ToolService {
  /**
   * Fetch tools from a client
   */
  async fetchToolsFromClient(
    connectedClient: ConnectedClient,
    serverConfig?: ServerConfig,
    meta?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      // Request tools from the client
      const response = await connectedClient.client.request(
        {
          method: 'tools/list',
          params: {
            _meta: meta,
          },
        },
        ListToolsResultSchema
      );

      // Check if tools were returned and ensure it's an array
      const toolsResponse = Array.isArray(response.tools) ? response.tools : [];
      if (toolsResponse.length === 0) {
        return [];
      }

      const processedTools = toolsResponse.map((tool) => {
        // Add server name prefix to description
        const processedTool = this.prefixToolDescription(tool, connectedClient.name);

        // Map the tool to the client directly using clientMaps
        clientMaps.mapToolToClient(processedTool.name, connectedClient);

        // Handle tool name mapping from exposedTools if configured
        if (serverConfig?.exposedTools) {
          // Find any tool mapping in exposedTools
          const toolMapping = serverConfig.exposedTools.find(
            (exposedTool) => typeof exposedTool !== 'string' && exposedTool.original === tool.name
          );

          if (toolMapping && typeof toolMapping !== 'string') {
            const exposedName = toolMapping.exposed;

            // Store original to exposed name mapping in client
            if (!connectedClient.client.toolMappings) {
              connectedClient.client.toolMappings = {};
            }
            connectedClient.client.toolMappings[exposedName] = tool.name;

            // Map the exposed name to the client as well
            clientMaps.mapToolToClient(exposedName, connectedClient);
          }
        }

        return processedTool;
      });

      return processedTools;
    } catch (error) {
      console.error(`Error fetching tools from ${connectedClient.name}:`, error);
      return [];
    }
  }

  /**
   * Execute a tool call
   */
  async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    client: ConnectedClient,
    meta?: Record<string, unknown>,
    originalToolName?: string
  ) {
    try {
      // The name to use when calling the tool (may be different from what the user specified)
      const callName = originalToolName || toolName;

      // Create request object
      const request = {
        method: 'tools/call',
        params: {
          name: callName,
          arguments: args,
          _meta: meta,
        },
      };

      // Log the tool request
      logServerToolRequest(toolName, client.name, request);

      // Call the tool
      const result = await client.client.request(request, CompatibilityCallToolResultSchema);

      // Log the tool response
      logServerToolResponse(toolName, result);

      return result;
    } catch (error) {
      // Log the tool error
      logServerToolError(toolName, client.name, error);
      console.error(`Error calling tool ${toolName} on ${client.name}:`, error);
      throw error;
    }
  }

  /**
   * Validate that a tool is allowed to be called based on server configuration
   */
  validateToolAccess(
    toolName: string,
    originalToolName: string | undefined,
    serverConfig: ServerConfig
  ): void {
    if (!serverConfig) return;

    const nameToCheck = originalToolName || toolName;

    // Check exposedTools
    if (serverConfig.exposedTools) {
      const exposedTools = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );

      if (!exposedTools.includes(nameToCheck)) {
        throw new Error(`Tool ${toolName} is not exposed by server`);
      }
    }

    // Check hiddenTools
    if (serverConfig.hiddenTools && serverConfig.hiddenTools.includes(nameToCheck)) {
      throw new Error(`Tool ${toolName} is hidden`);
    }
  }
  /**
   * Filter tools based on server configuration
   */
  filterTools(tools: Tool[] | null | undefined, serverConfig?: ServerConfig): Tool[] {
    if (!tools) return [];
    if (!serverConfig) return tools;

    // If exposedTools is defined, only include tools in that list
    if (serverConfig.exposedTools) {
      const exposedToolNames = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );
      return tools.filter((tool) => exposedToolNames.includes(tool.name));
    }

    // If hiddenTools is defined, exclude tools in that list
    if (serverConfig.hiddenTools) {
      return tools.filter((tool) => !serverConfig.hiddenTools?.includes(tool.name));
    }

    // If neither filter is applied, return all tools
    return tools;
  }

  /**
   * Process tool name based on server configuration
   */
  processToolName(toolName: string, serverConfig: ServerConfig): string {
    if (!serverConfig.exposedTools) return toolName;

    // Check if this tool is configured for renaming
    const toolConfig = serverConfig.exposedTools.find(
      (tool) => typeof tool !== 'string' && tool.original === toolName
    );

    // If found and has an 'exposed' property, return the exposed name
    if (toolConfig && typeof toolConfig !== 'string') {
      return toolConfig.exposed;
    }

    // Otherwise return the original name
    return toolName;
  }

  /**
   * Prefix tool description with client name
   */
  prefixToolDescription(tool: Tool, clientName: string): Tool {
    return {
      ...tool,
      description: `[${clientName}] ${tool.description}`,
    };
  }

  /**
   * Check if a tool is allowed based on server configuration
   */
  isToolAllowed(
    toolName: string,
    clientName: string,
    serverConfigs: Record<string, ServerConfig>
  ): boolean {
    const serverConfig = serverConfigs[clientName];
    if (!serverConfig) return true; // If no config, allow by default

    // Check exposed tools
    if (serverConfig.exposedTools) {
      const exposedToolNames = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );
      // If tool is specifically exposed, allow it regardless of hiddenTools
      if (exposedToolNames.includes(toolName)) {
        return true;
      }
      // If exposedTools is defined but tool is not in it, deny access
      return false;
    }

    // Check hidden tools (only if exposedTools is not defined)
    if (serverConfig.hiddenTools && serverConfig.hiddenTools.includes(toolName)) {
      return false;
    }

    return true;
  }
}

// Export a singleton instance
export const toolService = new ToolService();
