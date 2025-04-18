#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp-proxy.js';
import { createDefaultLogger, LogLevel } from './utils/logger.js';
import 'dotenv/config';

// ロガーの初期化
const logger = createDefaultLogger({
  dirPath: process.env.MCP_PROXY_LOG_DIRECTORY_PATH,
  level: process.env.MCP_PROXY_LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
});

// 標準出力をロガーにリダイレクト
logger.redirectConsole();

logger.info(`Server starting up`);

async function main() {
  const transport = new StdioServerTransport();
  const { server, cleanup } = await createServer();

  await server.connect(transport);

  async function closeAll() {
    logger.info('Close all clients');
    try {
      await cleanup();
    } catch {
      logger.error('Error during cleanup');
    }
    try {
      await server.close();
    } catch {
      logger.error('Error during server close');
    }
  }

  // Cleanup on exit
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');
    await closeAll();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await closeAll();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Server error:', error);
  logger.close();
  process.exit(1);
});
