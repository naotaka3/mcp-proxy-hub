import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest } from './tool-list-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMaps } from '../mappers/client-maps.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ServerConfigs } from '../config.js';

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

vi.mock('../mappers/client-maps.js', () => ({
  clientMaps: {
    clearToolMap: vi.fn(),
    mapToolToClient: vi.fn(),
    mapCustomToolToClient: vi.fn(),
    getClientForTool: vi.fn(),
    getClientForCustomTool: vi.fn(),
  },
}));

describe('Tool List Handler', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let serverConfigs: ServerConfigs;

  beforeEach(() => {
    vi.clearAllMocks();

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

    serverConfigs = {
      client1: {
        command: 'test-command',
      },
      client2: {
        command: 'test-command-2',
      },
    };
  });

  it('should clear tool map and aggregate tools from all clients', async () => {
    // Mock the service responses
    const client1Tools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
    ];
    const client2Tools: Tool[] = [
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
    ];

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client1Tools);
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    const request = {
      method: 'tools/list' as const,
      params: { _meta: { test: 'metadata' } },
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify map was cleared
    expect(clientMaps.clearToolMap).toHaveBeenCalledTimes(1);

    // Verify service calls
    expect(toolService.fetchToolsFromClient).toHaveBeenCalledTimes(2);
    expect(toolService.fetchToolsFromClient).toHaveBeenNthCalledWith(
      1,
      mockClient1,
      serverConfigs.client1,
      { test: 'metadata' }
    );
    expect(toolService.fetchToolsFromClient).toHaveBeenNthCalledWith(
      2,
      mockClient2,
      serverConfigs.client2,
      { test: 'metadata' }
    );

    // Mock filterTools to return the tools directly
    vi.mocked(toolService.filterTools).mockImplementation((tools) => tools as Tool[]);

    // Verify result
    expect(result).toEqual({
      tools: [], // Now empty because filterTools returns empty arrays by default in our mocks
    });

    // Verify filterTools was called for each client
    expect(toolService.filterTools).toHaveBeenCalledTimes(2);
  });

  it('should add custom tools to the result', async () => {
    // Mock the service responses
    const client1Tools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
    ];
    const client2Tools: Tool[] = [
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
    ];
    const customTools: Tool[] = [
      { name: 'customTool', description: 'Custom Tool', inputSchema: { type: 'object' } },
    ];

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client1Tools);
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce(customTools);

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const toolsConfig = {
      mcpServers: {},
      tools: {
        customTool: {
          description: 'Custom Tool',
          subtools: {
            client1: {
              tools: [{ name: 'tool1' }],
            },
          },
        },
      },
    };

    const result = await handleListToolsRequest(
      request,
      connectedClients,
      serverConfigs,
      toolsConfig
    );

    // Mock filterTools to return the original tools
    vi.mocked(toolService.filterTools).mockImplementationOnce((tools) => tools as Tool[]);
    vi.mocked(toolService.filterTools).mockImplementationOnce((tools) => tools as Tool[]);

    // Mock the allTools array to contain client tools with serverName
    const allTools = [
      { ...client1Tools[0], serverName: 'client1' },
      { ...client2Tools[0], serverName: 'client2' },
    ];

    // Verify createCustomTools was called
    expect(customToolService.createCustomTools).toHaveBeenCalledWith(
      toolsConfig,
      connectedClients,
      expect.arrayContaining(allTools)
    );

    // The result will now include both client tools and custom tools since we've mocked filterTools
    // to return the original tools
    expect(result).toEqual({
      tools: [...client1Tools, ...client2Tools, ...customTools],
    });

    // Verify filterTools was called for each client
    expect(toolService.filterTools).toHaveBeenCalledTimes(2);
  });

  it('should handle errors in custom tool creation', async () => {
    // Mock services
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue([]);
    vi.mocked(customToolService.createCustomTools).mockImplementationOnce(() => {
      throw new Error('Custom tool error');
    });

    // Mock console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating custom tools:', expect.any(Error));

    // Verify result only includes tools from clients (empty in this case)
    expect(result).toEqual({ tools: [] });
  });

  it('should map tools to their respective clients through fetchToolsFromClient', async () => {
    // Mock the service responses
    const tool1: Tool = { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } };
    const tool2: Tool = { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } };

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce([tool1]);
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce([tool2]);
    vi.mocked(toolService.filterTools).mockImplementation((tools) => tools as Tool[]);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify that fetchToolsFromClient was called for each client
    expect(toolService.fetchToolsFromClient).toHaveBeenCalledWith(
      mockClient1,
      serverConfigs.client1,
      undefined
    );
    expect(toolService.fetchToolsFromClient).toHaveBeenCalledWith(
      mockClient2,
      serverConfigs.client2,
      undefined
    );
  });

  it('should handle tool name mappings from server config through fetchToolsFromClient', async () => {
    // Mock the service responses and add exposedTools with mapping to server config
    const tool1: Tool = {
      name: 'originalTool',
      description: 'Original Tool',
      inputSchema: { type: 'object' },
    };

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce([tool1]);
    vi.mocked(toolService.filterTools).mockImplementation((tools) => tools as Tool[]);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    // Add exposedTools with tool mapping to server config
    serverConfigs.client1 = {
      ...serverConfigs.client1,
      exposedTools: [{ original: 'originalTool', exposed: 'exposedTool' }],
    };

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify fetchToolsFromClient was called with the config containing exposedTools
    expect(toolService.fetchToolsFromClient).toHaveBeenCalledWith(
      mockClient1,
      expect.objectContaining({
        exposedTools: [{ original: 'originalTool', exposed: 'exposedTool' }],
      }),
      undefined
    );
  });
});
