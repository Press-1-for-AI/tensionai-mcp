/**
 * OpenWebUI Integration
 * 
 * Provides MCP Gateway configuration and OpenAI-compatible API endpoints
 * for integration with OpenWebUI.
 */

import type { FastifyInstance } from "fastify";

/**
 * OpenWebUI Configuration
 */
export interface OpenWebUIConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** MCP Gateway URL */
  mcpGatewayUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Enable WebSocket for real-time debate */
  enableWebSocket: boolean;
  /** CORS origins */
  corsOrigins: string[];
}

/**
 * OpenAI-compatible API endpoint types
 */
export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * WebSocket message types for real-time debate
 */
export interface DebateMessage {
  type: "debate.start" | "debate.message" | "debate.complete" | "debate.error";
  taskId?: string;
  round?: number;
  speaker?: "planner" | "generator" | "evaluator";
  content?: string;
  timestamp: string;
}

/**
 * MCP Gateway Client
 */
class MCPGatewayClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /**
   * Forward request to MCP server
   */
  async forwardRequest<T>(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/mcp/call`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: toolName,
        arguments: args,
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP Gateway error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * List available MCP tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const response = await fetch(`${this.baseUrl}/mcp/tools`);
    return response.json();
  }
}

/**
 * OpenAI-compatible API handler
 */
export class OpenAICompatHandler {
  private mcpClient: MCPGatewayClient;

  constructor(mcpGatewayUrl: string, apiKey?: string) {
    this.mcpClient = new MCPGatewayClient(mcpGatewayUrl, apiKey);
  }

  /**
   * Handle chat completion request
   */
  async handleChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    // Extract the user's prompt from messages
    const userMessage = request.messages.find((m) => m.role === "user");
    if (!userMessage) {
      throw new Error("No user message found");
    }

    // Execute task via MCP
    const result = await this.mcpClient.forwardRequest<{
      taskId: string;
      status: string;
      output?: string;
      error?: string;
    }>("adversarial_execute", {
      prompt: userMessage.content,
      qualityLevel: "standard",
      maxSprints: 3,
    });

    // Convert to OpenAI format
    return {
      id: result.taskId,
      object: "chat.completion",
      created: Date.now(),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.output || result.error || "Task completed",
          },
          finish_reason: result.status === "completed" ? "stop" : "length",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  /**
   * Handle streaming chat completion
   * Note: This is a simplified implementation
   */
  async *handleStreamingChatCompletion(
    request: ChatCompletionRequest
  ): AsyncGenerator<string> {
    // For streaming, we'd need to implement WebSocket forwarding
    // This is a placeholder for the streaming response
    yield `data: ${JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Date.now(),
      model: request.model,
      choices: [{ index: 0, delta: { content: "" }, finish_reason: null }],
    })}\n\n`;
  }
}

/**
 * Register OpenWebUI routes with Fastify
 */
export function registerOpenWebUIRoutes(
  app: FastifyInstance,
  config: OpenWebUIConfig
): void {
  const openAIHandler = new OpenAICompatHandler(config.mcpGatewayUrl, config.apiKey);

  // OpenAI-compatible /v1/chat/completions endpoint
  app.post<{ Body: ChatCompletionRequest; Reply: ChatCompletionResponse }>(
    "/v1/chat/completions",
    async (request, reply) => {
      // Validate API key if configured
      if (config.apiKey) {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return reply.status(401).send({ error: "Missing or invalid API key" } as any);
        }
        const key = authHeader.substring(7);
        if (key !== config.apiKey) {
          return reply.status(401).send({ error: "Invalid API key" } as any);
        }
      }

      return openAIHandler.handleChatCompletion(request.body);
    }
  );

  // Model list endpoint
  app.get("/v1/models", async () => {
    return {
      object: "list",
      data: [
        {
          id: "adversarial-planner",
          object: "model",
          created: Date.now(),
          owned_by: "tensionai-mcp",
        },
        {
          id: "adversarial-generator",
          object: "model",
          created: Date.now(),
          owned_by: "tensionai-mcp",
        },
        {
          id: "adversarial-evaluator",
          object: "model",
          created: Date.now(),
          owned_by: "tensionai-mcp",
        },
      ],
    };
  });

  // MCP Gateway health check
  app.get("/mcp/health", async () => {
    return {
      status: "healthy",
      mcpGatewayUrl: config.mcpGatewayUrl,
      timestamp: new Date().toISOString(),
    };
  });

  // List MCP tools via gateway
  app.get("/mcp/tools", async () => {
    const tools = await openAIHandler["mcpClient"].listTools();
    return { tools };
  });

  // Call MCP tool via gateway
  app.post<{ Body: { tool: string; arguments: Record<string, unknown> } }>(
    "/mcp/call",
    async (request) => {
      const { tool, arguments: args } = request.body;
      return openAIHandler["mcpClient"].forwardRequest(tool, args);
    }
  );

  // WebSocket endpoint for real-time debate
  if (config.enableWebSocket) {
    app.get("/v1/debate/ws", { websocket: true }, (socket, request) => {
      const clientId = crypto.randomUUID();
      
      // Handle incoming messages
      socket.on("message", (data: string) => {
        try {
          const message: DebateMessage = JSON.parse(data.toString());
          
          if (message.type === "debate.start") {
            // Start a new debate session
            socket.send(JSON.stringify({
              type: "debate.started",
              taskId: message.taskId,
              timestamp: new Date().toISOString(),
            }));
          }
        } catch (error) {
          console.error("[OpenWebUI] Failed to parse WebSocket message:", error);
        }
      });

      // Handle disconnection
      socket.on("close", () => {
        console.log(`[OpenWebUI] Client ${clientId} disconnected`);
      });
    });
  }
}

/**
 * Create OpenWebUI integration
 */
export function createOpenWebUIIntegration(
  config: Partial<OpenWebUIConfig> = {}
): OpenWebUIConfig {
  return {
    port: config.port ?? 3001,
    host: config.host ?? "0.0.0.0",
    mcpGatewayUrl: config.mcpGatewayUrl ?? "http://localhost:3000",
    apiKey: config.apiKey,
    enableWebSocket: config.enableWebSocket ?? true,
    corsOrigins: config.corsOrigins ?? ["*"],
  };
}
