/**
 * MCP Stdio Server - Entry point for MCP stdio server
 * 
 * This starts the MCP server as a stdio server that IDEs can connect to.
 * Run with: bun run src/mcp/stdio.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  RequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getMCPServer, MCP_TOOLS } from "./server.js";
import crypto from "node:crypto";

// ============================================================================
// Configuration
// ============================================================================

const LOG_PREFIX = "[MCP-Stdio]";
const TOOL_TIMEOUT_MS = 300_000; // 5 minutes

// ============================================================================
// Cached Tools Response
// ============================================================================

const cachedToolsResponse = {
  tools: MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
};

// ============================================================================
// Create MCP Server
// ============================================================================

const mcpServer = getMCPServer();

const server = new Server(
  {
    name: "tensionai-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Request Handlers
// ============================================================================

// Server info handler
server.setRequestHandler(RequestSchema, async () => ({
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: {},
  },
  serverInfo: {
    name: "tensionai-mcp",
    version: "1.0.0",
  },
}));

// Cached tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return cachedToolsResponse;
});

// Tool call handler with logging, timeout, and error handling
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const requestId = crypto.randomUUID();
  const { name, arguments: args } = request.params;
  
  console.error(`${LOG_PREFIX} Request ${requestId}: ${name}`, JSON.stringify(args, null, 2));
  
  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request ${requestId} timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS);
  });
  
  try {
    const result = await Promise.race([
      mcpServer.handleToolCall(name, args),
      timeoutPromise
    ]);
    
    console.error(`${LOG_PREFIX} Request ${requestId}: Success`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Request ${requestId}: Error -`, error instanceof Error ? error.message : String(error));
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Stdin Close Handling
// ============================================================================

process.stdin.on("close", () => {
  console.error(`${LOG_PREFIX} stdin closed, shutting down...`);
  server.close().then(() => process.exit(0));
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  console.error(`${LOG_PREFIX} Received ${signal}, shutting down...`);
  try {
    await server.close();
    console.error(`${LOG_PREFIX} Server closed gracefully`);
    process.exit(0);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error during shutdown:`, error);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.error(`${LOG_PREFIX} Starting TensionAI MCP Server (stdio)...`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(`${LOG_PREFIX} Connected via stdio, ready for IDE connections`);
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} Failed to start MCP server:`, error);
  process.exit(1);
});
