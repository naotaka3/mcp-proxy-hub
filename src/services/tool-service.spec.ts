import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolService } from './tool-service.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { clientMaps } from '../mappers/client-maps.js';

interface ToolsResponse {
  tools: Tool[] | unknown;
}

describe('ToolService', () => {
  let toolService: ToolService;
  let mockClient: ConnectedClient;

  beforeEach(() => {
    vi.clearAllMocks();

    toolService = new ToolService();

    mockClient = {
      client: new Client({
        name: 'test-client',
        version: '1.0.0',
      }),
      name: 'testClient',
      cleanup: async () => {},
    };

    // Mock client request method
    mockClient.client.request = vi.fn();
  });

  describe('fetchToolsFromClient', () => {
    // Set up a spy on clientMaps.mapToolToClient instead of mocking it on toolService
    let mapToolToClientSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Create a spy on clientMaps.mapToolToClient
      mapToolToClientSpy = vi.spyOn(clientMaps, 'mapToolToClient');
    });
    it('should successfully fetch tools from a client', async () => {
      const toolsResponse: ToolsResponse = {
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
        ],
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      const result = await toolService.fetchToolsFromClient(mockClient);

      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: undefined,
          },
        },
        expect.any(Object)
      );

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('[testClient] Tool 1');
      expect(result[1].description).toBe('[testClient] Tool 2');
    });

    it('should return empty array when tools response is not an array', async () => {
      const toolsResponse: ToolsResponse = {
        tools: 'not an array',
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      const result = await toolService.fetchToolsFromClient(mockClient);

      expect(result).toEqual([]);
    });

    it('should return empty array when tools array is empty', async () => {
      const toolsResponse: ToolsResponse = {
        tools: [],
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      const result = await toolService.fetchToolsFromClient(mockClient);

      expect(result).toEqual([]);
    });

    it('should handle errors and return empty array', async () => {
      // Mock console.error to avoid polluting test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(mockClient.client.request).mockRejectedValueOnce(new Error('Test error'));

      const result = await toolService.fetchToolsFromClient(mockClient);

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should pass meta data to the client request', async () => {
      const toolsResponse: ToolsResponse = {
        tools: [],
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      const meta = { test: 'metadata' };
      await toolService.fetchToolsFromClient(mockClient, undefined, meta);

      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: meta,
          },
        },
        expect.any(Object)
      );
    });

    it('should map tools to client during fetch', async () => {
      const toolsResponse: ToolsResponse = {
        tools: [
          { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
        ],
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      await toolService.fetchToolsFromClient(mockClient);

      // Verify clientMaps.mapToolToClient was called for each tool
      expect(mapToolToClientSpy).toHaveBeenCalledTimes(2);
      expect(mapToolToClientSpy).toHaveBeenCalledWith('tool1', mockClient);
      expect(mapToolToClientSpy).toHaveBeenCalledWith('tool2', mockClient);
    });

    it('should handle tool name mappings from exposedTools', async () => {
      const toolsResponse: ToolsResponse = {
        tools: [
          { name: 'originalTool', description: 'Original Tool', inputSchema: { type: 'object' } },
        ],
      };

      vi.mocked(mockClient.client.request).mockResolvedValueOnce(toolsResponse);

      const serverConfig = {
        command: 'test',
        exposedTools: [{ original: 'originalTool', exposed: 'exposedTool' }],
      };

      await toolService.fetchToolsFromClient(mockClient, serverConfig);

      // Verify both original and exposed names are mapped
      expect(mapToolToClientSpy).toHaveBeenCalledWith('originalTool', mockClient);
      expect(mapToolToClientSpy).toHaveBeenCalledWith('exposedTool', mockClient);

      // Verify client toolMappings is updated
      expect(mockClient.client.toolMappings).toBeDefined();
      expect(mockClient.client.toolMappings?.exposedTool).toBe('originalTool');
    });
  });

  describe('executeToolCall', () => {
    it('should execute a tool call successfully', async () => {
      const mockResult = { result: 'success' };
      vi.mocked(mockClient.client.request).mockResolvedValueOnce(mockResult);

      const result = await toolService.executeToolCall('tool1', { param1: 'value1' }, mockClient);

      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'tool1',
            arguments: { param1: 'value1' },
            _meta: undefined,
          },
        },
        expect.any(Object)
      );

      expect(result).toBe(mockResult);
    });

    it('should use original tool name when provided', async () => {
      const mockResult = { result: 'success' };
      vi.mocked(mockClient.client.request).mockResolvedValueOnce(mockResult);

      await toolService.executeToolCall(
        'exposedName',
        { param1: 'value1' },
        mockClient,
        undefined,
        'originalName'
      );

      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'originalName',
            arguments: { param1: 'value1' },
            _meta: undefined,
          },
        },
        expect.any(Object)
      );
    });

    it('should pass meta data to client request', async () => {
      const mockResult = { result: 'success' };
      vi.mocked(mockClient.client.request).mockResolvedValueOnce(mockResult);

      const meta = { progressToken: 'token123' };
      await toolService.executeToolCall('tool1', { param1: 'value1' }, mockClient, meta);

      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'tool1',
            arguments: { param1: 'value1' },
            _meta: meta,
          },
        },
        expect.any(Object)
      );
    });

    it('should propagate errors from client', async () => {
      vi.mocked(mockClient.client.request).mockRejectedValueOnce(new Error('Client error'));

      await expect(toolService.executeToolCall('tool1', {}, mockClient)).rejects.toThrow(
        'Client error'
      );
    });
  });

  describe('validateToolAccess', () => {
    it('should throw error when tool is not in exposedTools', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: ['tool2', 'tool3'],
      };

      expect(() => {
        toolService.validateToolAccess('tool1', undefined, serverConfig);
      }).toThrow('Tool tool1 is not exposed by server');
    });

    it('should throw error when tool is in hiddenTools', () => {
      const serverConfig = {
        command: 'test',
        hiddenTools: ['tool1'],
      };

      expect(() => {
        toolService.validateToolAccess('tool1', undefined, serverConfig);
      }).toThrow('Tool tool1 is hidden');
    });

    it('should check original tool name when provided', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: ['originalName'],
      };

      expect(() => {
        toolService.validateToolAccess('exposedName', 'originalName', serverConfig);
      }).not.toThrow();

      const serverConfig2 = {
        command: 'test',
        exposedTools: ['otherTool'],
      };

      expect(() => {
        toolService.validateToolAccess('exposedName', 'originalName', serverConfig2);
      }).toThrow('Tool exposedName is not exposed by server');
    });

    it('should handle exposedTools with object format', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: [{ original: 'tool1', exposed: 'renamedTool1' }, 'tool2'],
      };

      expect(() => {
        toolService.validateToolAccess('renamedTool1', 'tool1', serverConfig);
      }).not.toThrow();

      expect(() => {
        toolService.validateToolAccess('tool3', undefined, serverConfig);
      }).toThrow('Tool tool3 is not exposed by server');
    });
  });

  describe('filterTools', () => {
    const testTools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      { name: 'tool3', description: 'Tool 3', inputSchema: { type: 'object' } },
    ];

    it('should return empty array when tools is null or undefined', () => {
      expect(toolService.filterTools(null)).toEqual([]);
      expect(toolService.filterTools(undefined)).toEqual([]);
    });

    it('should return all tools when server config is undefined', () => {
      expect(toolService.filterTools(testTools)).toEqual(testTools);
    });

    it('should filter tools based on exposedTools', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: ['tool1', 'tool3'],
      };

      const result = toolService.filterTools(testTools, serverConfig);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool3');
    });

    it('should filter tools based on hiddenTools', () => {
      const serverConfig = {
        command: 'test',
        hiddenTools: ['tool2'],
      };

      const result = toolService.filterTools(testTools, serverConfig);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool3');
    });

    it('should handle exposedTools with object format', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: [{ original: 'tool1', exposed: 'renamedTool1' }, 'tool3'],
      };

      const result = toolService.filterTools(testTools, serverConfig);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool3');
    });
  });

  describe('processToolName', () => {
    it('should return original name when exposedTools is undefined', () => {
      const serverConfig = {
        command: 'test',
      };

      const result = toolService.processToolName('tool1', serverConfig);

      expect(result).toBe('tool1');
    });

    it('should return original name when tool is not configured for renaming', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: ['tool1', 'tool2'],
      };

      const result = toolService.processToolName('tool1', serverConfig);

      expect(result).toBe('tool1');
    });

    it('should return exposed name when tool is configured for renaming', () => {
      const serverConfig = {
        command: 'test',
        exposedTools: [{ original: 'tool1', exposed: 'renamedTool1' }, 'tool2'],
      };

      const result = toolService.processToolName('tool1', serverConfig);

      expect(result).toBe('renamedTool1');
    });
  });

  describe('prefixToolDescription', () => {
    it('should add client name prefix to tool description', () => {
      const tool: Tool = {
        name: 'tool1',
        description: 'Tool description',
        inputSchema: { type: 'object' },
      };

      const result = toolService.prefixToolDescription(tool, 'testClient');

      expect(result.description).toBe('[testClient] Tool description');
      expect(result.name).toBe('tool1'); // Name should remain unchanged
      expect(result.inputSchema).toBe(tool.inputSchema); // Schema should remain unchanged
    });
  });

  describe('isToolAllowed', () => {
    it('should return true when server config is undefined', () => {
      const serverConfigs = {};

      const result = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);

      expect(result).toBe(true);
    });

    it('should return true when tool is in exposedTools', () => {
      const serverConfigs = {
        testClient: {
          command: 'test',
          exposedTools: ['tool1', 'tool2'],
        },
      };

      const result = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);

      expect(result).toBe(true);
    });

    it('should return false when tool is not in exposedTools', () => {
      const serverConfigs = {
        testClient: {
          command: 'test',
          exposedTools: ['tool2', 'tool3'],
        },
      };

      const result = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);

      expect(result).toBe(false);
    });

    it('should return false when tool is in hiddenTools', () => {
      const serverConfigs = {
        testClient: {
          command: 'test',
          hiddenTools: ['tool1'],
        },
      };

      const result = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);

      expect(result).toBe(false);
    });

    it('should return true when tool is not in hiddenTools', () => {
      const serverConfigs = {
        testClient: {
          command: 'test',
          hiddenTools: ['tool2', 'tool3'],
        },
      };

      const result = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);

      expect(result).toBe(true);
    });

    it('should handle exposedTools with object format', () => {
      const serverConfigs = {
        testClient: {
          command: 'test',
          exposedTools: [{ original: 'tool1', exposed: 'renamedTool1' }, 'tool2'],
        },
      };

      const resultOriginal = toolService.isToolAllowed('tool1', 'testClient', serverConfigs);
      expect(resultOriginal).toBe(true);

      const resultUnknown = toolService.isToolAllowed('tool3', 'testClient', serverConfigs);
      expect(resultUnknown).toBe(false);
    });
  });
});
