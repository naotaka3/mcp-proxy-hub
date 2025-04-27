import { clientMaps } from '../mappers/client-maps.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { expandEnvVars, unexpandEnvVars, combineEnvVars } from '../utils/env-var-utils.js';
import { JsonObject } from '../types/json.js';
import { Config } from '../config.js';
import { logUnknownTool } from '../utils/debug-utils.js';

/**
 * Handles tool call requests
 */
export async function handleToolCall(
  request: {
    params: {
      name: string;
      _meta?: {
        progressToken?: string | number;
      };
      arguments?: Record<string, unknown>;
    } & { [k: string]: unknown };
    method: 'tools/call';
  },
  config: Config
) {
  const { name: toolName, arguments: args } = request.params;

  // Get the client for this tool
  const clientForTool = clientMaps.getClientForTool(toolName);

  if (!clientForTool) {
    // Log unknown tool information for debugging
    logUnknownTool(toolName, request.params, clientMaps);

    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Handle custom tool call
  if (clientForTool.name === 'custom') {
    return await customToolService.handleCustomToolCall(
      toolName,
      args,
      request.params._meta,
      config.mcpServers,
      config.envVars
    );
  }

  // Find the original name mapping from the client if it exists
  const originalToolName = clientForTool.client.toolMappings?.[toolName];

  // Validate tool access based on config
  const serverConfig = config.mcpServers[clientForTool.name];
  if (serverConfig) {
    toolService.validateToolAccess(toolName, originalToolName, serverConfig);
  }

  // Combine global and server-specific environment variables
  const combinedEnvVars = combineEnvVars(config.envVars, serverConfig?.envVars);

  // Expand environment variables in arguments if configured
  const expandedArgs =
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    args != null ? expandEnvVars(args as JsonObject, combinedEnvVars) : {};

  // Execute the tool call
  const result = await toolService.executeToolCall(
    toolName,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    expandedArgs as Record<string, unknown>,
    clientForTool,
    request.params._meta,
    originalToolName
  );

  // Unexpand environment variables in response if configured
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return unexpandEnvVars(result as JsonObject, combinedEnvVars) as typeof result;
}
