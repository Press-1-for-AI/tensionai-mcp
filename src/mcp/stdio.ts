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
} from "@modelcontextprotocol/sdk/types.js";
import { getMCPServer, MCP_TOOLS } from "./server.js";

// Create MCP server instance
const mcpServer = getMCPServer();

// Create the MCP server using the SDK
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

// Set up the tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const result = await mcpServer.handleToolCall(name, args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
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

// Start the stdio server
async function main() {
  console.error("Starting TensionAI MCP Server (stdio)...");
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("TensionAI MCP Server connected via stdio");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
