import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest } from './tool-list-handler.js';
import { handleToolCall } from './tool-call-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';
import { Config, ServerName, ServerConfig } from '../config.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
vi.mock('../services/tool-service.js', () => ({
  toolService: {
    fetchToolsFromClient: vi.fn(),
    validateToolAccess: vi.fn(),
    executeToolCall: vi.fn(),
    filterTools: vi.fn(),
    processToolName: vi.fn(),
    prefixToolDescription: vi.fn(),
    isToolAllowed: vi.fn(),
  },
}));

vi.mock('../services/custom-tool-service.js', () => ({
  customToolService: {
    createCustomTools: vi.fn(),
    handleCustomToolCall: vi.fn(),
  },
}));

// Mock clientMaps with simple spy functions
vi.mock('../mappers/client-maps.js', () => ({
  clientMaps: {
    clearToolMap: vi.fn(),
    mapToolToClient: vi.fn(),
    mapCustomToolToClient: vi.fn(),
    getClientForTool: vi.fn(),
    getClientForCustomTool: vi.fn(),
  },
}));

describe('Integration Tests for Tool Handlers with Shared ClientMaps', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let serverConfigs: Record<ServerName, ServerConfig>;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock clients
    mockClient1 = {
      client: new Client({
        name: 'client-1',
        version: '1.0.0',
      }),
      name: 'client1',
      cleanup: async () => {},
    };

    mockClient2 = {
      client: new Client({
        name: 'client-2',
        version: '1.0.0',
      }),
      name: 'client2',
      cleanup: async () => {},
    };

    connectedClients = [mockClient1, mockClient2];

    // Setup server configs
    serverConfigs = {
      client1: {
        command: 'test-command',
      },
      client2: {
        command: 'test-command-2',
      },
    };

    // Full config for tool call handler
    config = {
      mcpServers: serverConfigs,
      envVars: [],
    };

    // Reset the client maps before each test
    vi.mocked(clientMaps.clearToolMap).mockClear();
    clientMaps.clearToolMap();
  });

  it('should map tools to clients during list and then correctly retrieve them during call', async () => {
    // Define tools for each client
    const client1Tool: Tool = {
      name: 'tool1',
      description: 'Tool 1 from client1',
      inputSchema: { type: 'object' },
    };

    const client2Tool: Tool = {
      name: 'tool2',
      description: 'Tool 2 from client2',
      inputSchema: { type: 'object' },
    };

    // Mock tool service to return tools and do the mapping side effect
    vi.mocked(toolService.fetchToolsFromClient).mockImplementation((client) => {
      if (client === mockClient1) {
        clientMaps.mapToolToClient('tool1', mockClient1);
        return Promise.resolve([client1Tool]);
      } else if (client === mockClient2) {
        clientMaps.mapToolToClient('tool2', mockClient2);
        return Promise.resolve([client2Tool]);
      }
      return Promise.resolve([]);
    });

    // Mock filterTools to return the tools directly
    vi.mocked(toolService.filterTools).mockImplementation((tools) => tools as Tool[]);

    // Custom tools will be empty for this test
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    // When executeToolCall is called, return a success result
    vi.mocked(toolService.executeToolCall).mockResolvedValueOnce({
      result: 'success from client1',
    });

    // 1. First call handleListToolsRequest to populate the clientMaps
    const listRequest = {
      method: 'tools/list' as const,
      params: {},
    };

    const listResult = await handleListToolsRequest(listRequest, connectedClients, serverConfigs);

    // Verify that mapToolToClient was called for each tool
    expect(clientMaps.mapToolToClient).toHaveBeenCalledTimes(2);
    expect(clientMaps.mapToolToClient).toHaveBeenNthCalledWith(1, 'tool1', mockClient1);
    expect(clientMaps.mapToolToClient).toHaveBeenNthCalledWith(2, 'tool2', mockClient2);

    // Verify list result
    expect(listResult).toEqual({
      tools: [client1Tool, client2Tool],
    });

    // 2. Now call handleToolCall to use one of the mapped tools
    const callRequest = {
      method: 'tools/call' as const,
      params: {
        name: 'tool1',
        arguments: { param: 'value' },
      },
    };

    // Mock getClientForTool to return the correct client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient1);

    const callResult = await handleToolCall(callRequest, config);

    // Verify that getClientForTool was called with the right tool name
    expect(vi.mocked(clientMaps.getClientForTool).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(clientMaps.getClientForTool).mock.calls[0][0]).toBe('tool1');

    // Verify that executeToolCall was called with the right client
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'tool1',
      { param: 'value' },
      mockClient1,
      undefined,
      undefined
    );

    // Verify tool call result
    expect(callResult).toEqual({ result: 'success from client1' });
  });

  it('should handle tool call errors when client is not found in map', async () => {
    // Mock getClientForTool to return undefined for unknown tool
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(undefined);

    const callRequest = {
      method: 'tools/call' as const,
      params: {
        name: 'unknownTool',
        arguments: {},
      },
    };

    // Expect handleToolCall to throw error about unknown tool
    await expect(handleToolCall(callRequest, config)).rejects.toThrow('Unknown tool: unknownTool');
  });

  it('should handle custom tools across both list and call operations', async () => {
    // Define a custom tool
    const customTool: Tool = {
      name: 'customTool',
      description: 'Custom Tool',
      inputSchema: { type: 'object' },
    };

    // No regular tools for this test
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue([]);
    vi.mocked(toolService.filterTools).mockImplementation((tools) => tools as Tool[]);

    // Mock custom tool creation
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([customTool]);

    // Mock custom tool call handling
    const mockCustomResult = { result: 'custom-success' };
    vi.mocked(customToolService.handleCustomToolCall).mockResolvedValueOnce(mockCustomResult);

    // Define toolsConfig with custom tool mapping
    const toolsConfig = {
      mcpServers: {},
      tools: {
        customTool: {
          description: 'Custom Tool',
          subtools: {
            client1: {
              tools: [{ name: 'subtool1' }],
            },
          },
        },
      },
    };

    // 1. First call handleListToolsRequest to register the custom tool
    const listRequest = {
      method: 'tools/list' as const,
      params: {},
    };

    const listResult = await handleListToolsRequest(
      listRequest,
      connectedClients,
      serverConfigs,
      toolsConfig
    );

    // Verify list result includes custom tool
    expect(listResult).toEqual({
      tools: [customTool],
    });

    // Create mock custom client for the test
    const mockCustomClient: ConnectedClient = {
      client: {} as Client,
      name: 'custom',
      cleanup: async () => {},
    };

    // Mock getClientForTool to return the custom client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockCustomClient);

    // 2. Now call handleToolCall with the custom tool
    const callRequest = {
      method: 'tools/call' as const,
      params: {
        name: 'customTool',
        arguments: { server: 'client1', tool: 'subtool1' },
      },
    };

    const callResult = await handleToolCall(callRequest, config);

    // Verify handleCustomToolCall was called correctly
    expect(customToolService.handleCustomToolCall).toHaveBeenCalledWith(
      'customTool',
      { server: 'client1', tool: 'subtool1' },
      undefined,
      config.mcpServers,
      config.envVars
    );

    // Verify custom tool call result
    expect(callResult).toEqual(mockCustomResult);
  });

  it('should handle renamed tools correctly across list and call operations', async () => {
    // Define a tool that will be renamed
    const originalTool: Tool = {
      name: 'originalTool',
      description: 'Original Tool',
      inputSchema: { type: 'object' },
    };

    // Add exposedTools with tool mapping to server config
    serverConfigs.client1 = {
      ...serverConfigs.client1,
      exposedTools: [{ original: 'originalTool', exposed: 'renamedTool' }],
    };

    // Mock tool service to return the original tool and do the mapping side effect
    vi.mocked(toolService.fetchToolsFromClient).mockImplementation((client) => {
      if (client.name === 'client1') {
        clientMaps.mapToolToClient('renamedTool', mockClient1);
        return Promise.resolve([originalTool]);
      }
      return Promise.resolve([]);
    });

    // Mock processToolName to handle the renaming
    vi.mocked(toolService.processToolName).mockImplementation((toolName, config) => {
      if (config?.exposedTools) {
        const mapping = config.exposedTools.find(
          (m) => typeof m !== 'string' && m.original === toolName
        );
        if (mapping && typeof mapping !== 'string') {
          return mapping.exposed;
        }
      }
      return toolName;
    });

    // Mock filterTools to return processed tools
    vi.mocked(toolService.filterTools).mockImplementation((tools) => {
      if (!tools) return [];
      return tools.map((tool) => ({
        ...tool,
        name: tool.name === 'originalTool' ? 'renamedTool' : tool.name,
      })) as Tool[];
    });

    // No custom tools for this test
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    // Setup tool mappings directly on the client for the call phase
    mockClient1.client.toolMappings = {
      renamedTool: 'originalTool',
    };

    // Mock successful tool execution
    vi.mocked(toolService.executeToolCall).mockResolvedValueOnce({ result: 'success' });

    // 1. First call handleListToolsRequest to register the renamed tool
    const listRequest = {
      method: 'tools/list' as const,
      params: {},
    };

    const listResult = await handleListToolsRequest(listRequest, connectedClients, serverConfigs);

    // Verify list result includes renamed tool
    expect(listResult.tools.some((tool) => tool.name === 'renamedTool')).toBe(true);
    expect(listResult.tools.some((tool) => tool.name === 'originalTool')).toBe(false);

    // Verify the tool was mapped correctly
    expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('renamedTool', mockClient1);

    // 2. Now call handleToolCall with the renamed tool
    const callRequest = {
      method: 'tools/call' as const,
      params: {
        name: 'renamedTool',
        arguments: {},
      },
    };

    // Mock getClientForTool to return the correct client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient1);

    await handleToolCall(callRequest, config);

    // Verify validateToolAccess was called with both names
    expect(toolService.validateToolAccess).toHaveBeenCalledWith(
      'renamedTool',
      'originalTool',
      serverConfigs.client1
    );

    // Verify executeToolCall was called with exposed name but passes original name
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'renamedTool',
      {},
      mockClient1,
      undefined,
      'originalTool'
    );
  });
});
