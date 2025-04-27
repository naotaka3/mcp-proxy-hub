/**
 * Utilities for debugging and logging in the MCP Coordinator
 */

/**
 * Checks if the application is running in debug mode
 *
 * @returns true if debug mode is enabled, false otherwise
 */
export function isDebugMode(): boolean {
  return process.env.MCP_PROXY_LOG_LEVEL === 'debug';
}

/**
 * Formats any value for console output, handling special cases for JSON strings
 * and properly displaying newline characters
 *
 * @param value The value to format
 * @returns A string representation of the value, with nested JSON properly formatted
 *          and newline characters preserved
 */
export function formatForConsole(value: unknown): string {
  // Step 1: Convert the value to a JSON string with proper formatting
  const stringified = convertToFormattedJsonString(value);

  // Step 2: Process escaped characters in the string
  return processEscapedCharacters(stringified);
}

/**
 * Checks if a string looks like a JSON object or array
 *
 * @param str The string to check
 * @returns True if the string appears to be JSON, false otherwise
 */
function isJsonLike(str: string): boolean {
  return (str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'));
}

/**
 * Attempts to parse a string as JSON
 *
 * @param str The string to parse
 * @returns The parsed JSON object or the original string if parsing fails
 */
function tryParseJson(str: string): unknown {
  try {
    if (isJsonLike(str)) {
      return JSON.parse(str);
    }
  } catch {
    // Not valid JSON, return as is
  }
  return str;
}

/**
 * Converts a value to a formatted JSON string, parsing any nested JSON strings
 *
 * @param value The value to convert
 * @returns A formatted JSON string representation of the value
 */
function convertToFormattedJsonString(value: unknown): string {
  // Handle primitives and null
  if (typeof value !== 'object' || value === null) {
    // Special case for strings that might be JSON
    if (typeof value === 'string') {
      const parsedValue = tryParseJson(value);
      if (parsedValue !== value) {
        // If it was parsed successfully, stringify the parsed object
        return JSON.stringify(parsedValue, null, 2);
      }
    }
    // For other primitives or non-JSON strings
    return JSON.stringify(value, null, 2);
  }

  // For objects and arrays, handle nested JSON strings
  return JSON.stringify(
    value,
    (key, val) => {
      if (typeof val === 'string') {
        return tryParseJson(val);
      }
      return val;
    },
    2
  );
}

/**
 * Processes escaped characters in a JSON string, specifically handling
 * escaped newlines (\n) and escaped backslashes (\\)
 *
 * @param str The JSON string to process
 * @returns The processed string with correctly displayed escaped characters
 */
function processEscapedCharacters(str: string): string {
  return str.replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
}

/**
 * Logs a custom tool request if debug mode is enabled
 *
 * @param toolName Name of the tool being called
 * @param args Arguments passed to the tool
 */
export function logCustomToolRequest(toolName: string, args: unknown): void {
  if (!isDebugMode()) return;

  console.log('\n' + '='.repeat(80));
  console.log(`📤 CUSTOM TOOL REQUEST: ${toolName}`);
  console.log('-'.repeat(80));
  console.log('Arguments:', formatForConsole(args));
}

/**
 * Logs a custom tool response if debug mode is enabled
 *
 * @param result The result returned from the tool
 */
export function logCustomToolResponse(result: unknown): void {
  if (!isDebugMode()) return;

  console.log('-'.repeat(80));
  console.log(`📥 CUSTOM TOOL RESPONSE:`);
  console.log('-'.repeat(80));
  console.log(formatForConsole(result));
  console.log('='.repeat(80) + '\n');
}

/**
 * Logs a custom tool error if debug mode is enabled
 *
 * @param toolName Name of the tool that encountered an error
 * @param error The error that occurred
 */
export function logCustomToolError(toolName: string, error: unknown): void {
  if (!isDebugMode()) return;

  console.error('\n' + '!'.repeat(80));
  console.error(`❌ ERROR IN CUSTOM TOOL: ${toolName}`);
  console.error('-'.repeat(80));
  console.error(error);
  console.error('!'.repeat(80) + '\n');
}

/**
 * Logs a server tool request if debug mode is enabled
 *
 * @param toolName Name of the tool being called
 * @param serverName Name of the server handling the request
 * @param requestObj The request object being sent
 */
export function logServerToolRequest(
  toolName: string,
  serverName: string,
  requestObj: unknown
): void {
  if (!isDebugMode()) return;

  console.log('\n' + '='.repeat(80));
  console.log(`📤 SERVER TOOL REQUEST: ${toolName} → ${serverName}`);
  console.log('-'.repeat(80));
  console.log('Request:', formatForConsole(requestObj));
}

/**
 * Logs a server tool response if debug mode is enabled
 *
 * @param toolName Name of the tool that was called
 * @param result The result returned from the tool
 */
export function logServerToolResponse(toolName: string, result: unknown): void {
  if (!isDebugMode()) return;

  console.log('-'.repeat(80));
  console.log(`📥 SERVER TOOL RESPONSE: ${toolName}`);
  console.log('-'.repeat(80));
  console.log(formatForConsole(result));
  console.log('='.repeat(80) + '\n');
}

/**
 * Logs a server tool error if debug mode is enabled
 *
 * @param toolName Name of the tool that encountered an error
 * @param serverName Name of the server that was handling the request
 * @param error The error that occurred
 */
export function logServerToolError(toolName: string, serverName: string, error: unknown): void {
  if (!isDebugMode()) return;

  console.error('\n' + '!'.repeat(80));
  console.error(`❌ ERROR IN SERVER TOOL: ${toolName} (${serverName})`);
  console.error('-'.repeat(80));
  console.error(error);
  console.error('!'.repeat(80) + '\n');
}

/**
 * Logs debug information for unknown tools
 *
 * @param toolName Name of the unknown tool
 * @param requestParams Request parameters that were sent
 * @param clientMaps Client mappings available in the system
 */
export function logUnknownTool(
  toolName: string,
  requestParams: unknown,
  clientMaps: unknown
): void {
  if (!isDebugMode()) return;

  console.log('\n' + '!'.repeat(80));
  console.log(`❌ DEBUG: Unknown tool: ${toolName}`);
  console.log('-'.repeat(80));
  console.log('Request params:', formatForConsole(requestParams));
  console.log('-'.repeat(80));
  console.log('Client maps tool mapping:', formatForConsole(clientMaps));
  console.log('!'.repeat(80) + '\n');
}
