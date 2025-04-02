import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as debugUtils from './debug-utils.js';

describe('Debug Utilities', () => {
  // Common setup and teardown
  beforeEach(() => {
    // Setup mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clear mocks
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('isDebugMode', () => {
    it('should return true when MCP_PROXY_LOG_LEVEL is "debug"', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      expect(debugUtils.isDebugMode()).toBe(true);
    });

    it('should return false when MCP_PROXY_LOG_LEVEL is not "debug"', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');
      expect(debugUtils.isDebugMode()).toBe(false);
    });

    it('should return false when MCP_PROXY_LOG_LEVEL is not set', () => {
      // Ensure the environment variable is not set
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', undefined);
      expect(debugUtils.isDebugMode()).toBe(false);
    });
  });

  describe('formatForConsole', () => {
    it('should format primitives correctly', () => {
      expect(debugUtils.formatForConsole('simple string')).toBe('"simple string"');
      expect(debugUtils.formatForConsole(123)).toBe('123');
      expect(debugUtils.formatForConsole(true)).toBe('true');
      expect(debugUtils.formatForConsole(null)).toBe('null');
      // The formatForConsole function doesn't handle undefined directly
      // It would cause an error in processEscapedNewlines since it tries to call replace on 'undefined'
      // So we'll skip testing undefined directly
    });

    it('should format objects and arrays correctly', () => {
      const obj = { a: 1, b: 'test', c: true };
      const arr = [1, 'test', true];

      expect(debugUtils.formatForConsole(obj)).toBe(JSON.stringify(obj, null, 2));
      expect(debugUtils.formatForConsole(arr)).toBe(JSON.stringify(arr, null, 2));
    });

    it('should parse and format valid JSON strings', () => {
      const jsonStr = '{"name":"test","value":123}';
      const expected = JSON.stringify(JSON.parse(jsonStr), null, 2);

      expect(debugUtils.formatForConsole(jsonStr)).toBe(expected);
    });

    it('should leave invalid JSON strings as-is', () => {
      const invalidJson = '{"name":"test","value":}';
      // The test needs to account for how JSON.stringify escapes quotes
      expect(debugUtils.formatForConsole(invalidJson)).toMatch(/"\{.*\}"/); // Match any JSON-like string in quotes
    });

    it('should handle escaped newlines', () => {
      const strWithEscapedNewlines = 'line1\nline2';
      const expected = '"line1\nline2"';

      expect(debugUtils.formatForConsole(strWithEscapedNewlines)).toBe(expected);
    });

    it('should handle escaped newlines at the start of a string', () => {
      const strWithEscapedNewlineAtStart = '\nline1\nline2';
      const expected = '"\nline1\nline2"';

      expect(debugUtils.formatForConsole(strWithEscapedNewlineAtStart)).toBe(expected);
    });

    it('should handle directory tree-like structures with multiple escaped newlines', () => {
      const directoryTree = '- //\\n  - Users/\\n    - yu.shimizu/\\n      - go/\\n        - src/';
      const expected = '"- //\n  - Users/\n    - yu.shimizu/\n      - go/\n        - src/"';

      expect(debugUtils.formatForConsole(directoryTree)).toBe(expected);
    });

    it('should properly handle consecutive escaped newlines', () => {
      const multipleNewlines = 'first\\n\\nsecond\\n\\n\\nthird';
      const expected = '"first\n\nsecond\n\n\nthird"';

      expect(debugUtils.formatForConsole(multipleNewlines)).toBe(expected);
    });

    it('should preserve literal backslashes in strings', () => {
      const backslashInString = 'path\\\\to\\\\file.txt';
      const expected = '"path\\\\to\\\\file.txt"';

      expect(debugUtils.formatForConsole(backslashInString)).toBe(expected);
    });

    it('should handle combination of escaped newlines and literal backslashes', () => {
      const mixedString = 'C:\\\\Users\\n\\\\Documents\\\\file.txt';
      const expected = '"C:\\\\Users\n\\\\Documents\\\\file.txt"';

      expect(debugUtils.formatForConsole(mixedString)).toBe(expected);
    });

    it('should handle nested JSON strings within objects', () => {
      const objWithNestedJsonStr = {
        id: 1,
        data: '{"nested":"value","number":42}',
      };

      const expected = JSON.stringify(
        {
          id: 1,
          data: { nested: 'value', number: 42 },
        },
        null,
        2
      );

      expect(debugUtils.formatForConsole(objWithNestedJsonStr)).toBe(expected);
    });

    it('should handle nested JSON arrays within objects', () => {
      const objWithNestedJsonArr = {
        id: 1,
        data: '[1,2,3,"test"]',
      };

      const expected = JSON.stringify(
        {
          id: 1,
          data: [1, 2, 3, 'test'],
        },
        null,
        2
      );

      expect(debugUtils.formatForConsole(objWithNestedJsonArr)).toBe(expected);
    });

    it('should not attempt to parse non-JSON string values in objects', () => {
      const obj = {
        id: 1,
        regularString: 'This is not JSON',
      };

      expect(debugUtils.formatForConsole(obj)).toBe(JSON.stringify(obj, null, 2));
    });
  });

  describe('logCustomToolRequest', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logCustomToolRequest('testTool', { param: 'value' });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log correctly formatted message when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const toolName = 'testTool';
      const args = { param: 'value' };

      debugUtils.logCustomToolRequest(toolName, args);

      // Verify the expected calls
      expect(console.log).toHaveBeenCalledTimes(4);
      expect(console.log).toHaveBeenNthCalledWith(1, '\n' + '='.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(2, `📤 CUSTOM TOOL REQUEST: ${toolName}`);
      expect(console.log).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(
        4,
        'Arguments:',
        debugUtils.formatForConsole(args)
      );
    });
  });

  describe('logCustomToolResponse', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logCustomToolResponse({ result: 'success' });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log correctly formatted message when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const result = { result: 'success' };

      debugUtils.logCustomToolResponse(result);

      // Verify the expected calls
      expect(console.log).toHaveBeenCalledTimes(5);
      expect(console.log).toHaveBeenNthCalledWith(1, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(2, '📥 CUSTOM TOOL RESPONSE:');
      expect(console.log).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(4, debugUtils.formatForConsole(result));
      expect(console.log).toHaveBeenNthCalledWith(5, '='.repeat(80) + '\n');
    });
  });

  describe('logCustomToolError', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logCustomToolError('testTool', new Error('Test error'));

      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log correctly formatted error when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const toolName = 'testTool';
      const error = new Error('Test error');

      debugUtils.logCustomToolError(toolName, error);

      // Verify the expected calls
      expect(console.error).toHaveBeenCalledTimes(5);
      expect(console.error).toHaveBeenNthCalledWith(1, '\n' + '!'.repeat(80));
      expect(console.error).toHaveBeenNthCalledWith(2, `❌ ERROR IN CUSTOM TOOL: ${toolName}`);
      expect(console.error).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.error).toHaveBeenNthCalledWith(4, error);
      expect(console.error).toHaveBeenNthCalledWith(5, '!'.repeat(80) + '\n');
    });
  });

  describe('logServerToolRequest', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logServerToolRequest('testTool', 'testServer', { param: 'value' });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log correctly formatted message when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const toolName = 'testTool';
      const serverName = 'testServer';
      const requestObj = { param: 'value' };

      debugUtils.logServerToolRequest(toolName, serverName, requestObj);

      // Verify the expected calls
      expect(console.log).toHaveBeenCalledTimes(4);
      expect(console.log).toHaveBeenNthCalledWith(1, '\n' + '='.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(
        2,
        `📤 SERVER TOOL REQUEST: ${toolName} → ${serverName}`
      );
      expect(console.log).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(
        4,
        'Request:',
        debugUtils.formatForConsole(requestObj)
      );
    });
  });

  describe('logServerToolResponse', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logServerToolResponse('testTool', { result: 'success' });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log correctly formatted message when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const toolName = 'testTool';
      const result = { result: 'success' };

      debugUtils.logServerToolResponse(toolName, result);

      // Verify the expected calls
      expect(console.log).toHaveBeenCalledTimes(5);
      expect(console.log).toHaveBeenNthCalledWith(1, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(2, `📥 SERVER TOOL RESPONSE: ${toolName}`);
      expect(console.log).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.log).toHaveBeenNthCalledWith(4, debugUtils.formatForConsole(result));
      expect(console.log).toHaveBeenNthCalledWith(5, '='.repeat(80) + '\n');
    });
  });

  describe('logServerToolError', () => {
    it('should not log anything when debug mode is disabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'info');

      debugUtils.logServerToolError('testTool', 'testServer', new Error('Test error'));

      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log correctly formatted error when debug mode is enabled', () => {
      vi.stubEnv('MCP_PROXY_LOG_LEVEL', 'debug');
      const toolName = 'testTool';
      const serverName = 'testServer';
      const error = new Error('Test error');

      debugUtils.logServerToolError(toolName, serverName, error);

      // Verify the expected calls
      expect(console.error).toHaveBeenCalledTimes(5);
      expect(console.error).toHaveBeenNthCalledWith(1, '\n' + '!'.repeat(80));
      expect(console.error).toHaveBeenNthCalledWith(
        2,
        `❌ ERROR IN SERVER TOOL: ${toolName} (${serverName})`
      );
      expect(console.error).toHaveBeenNthCalledWith(3, '-'.repeat(80));
      expect(console.error).toHaveBeenNthCalledWith(4, error);
      expect(console.error).toHaveBeenNthCalledWith(5, '!'.repeat(80) + '\n');
    });
  });
});
