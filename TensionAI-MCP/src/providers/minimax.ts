/**
 * MiniMax Provider - Support for MiniMax API
 * 
 * MiniMax is a Chinese AI company offering various models through their API.
 * API documentation: https://platform.minimax.chat/
 */

import type {
  LLMProvider,
  ChatOptions,
  ChatResponse,
} from "../shared/types.js";

// ============================================================================
// Environment Configuration
// ============================================================================

function getEnv(key: string): string | undefined {
  return process.env[key];
}

// ============================================================================
// MiniMax API Types
// ============================================================================

interface MiniMaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MiniMaxRequest {
  model: string;
  messages: MiniMaxMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface MiniMaxResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface MiniMaxErrorResponse {
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  error?: {
    message: string;
    code: string;
  };
}

// ============================================================================
// MiniMax Provider
// ============================================================================

export class MiniMaxProvider implements LLMProvider {
  public readonly name = "minimax";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = getEnv("MINIMAX_API_KEY") ?? "";
    if (!this.apiKey) {
      throw new Error("MINIMAX_API_KEY environment variable is required");
    }
    
    this.baseUrl = getEnv("MINIMAX_BASE_URL") ?? "https://api.minimax.chat/v1";
    this.defaultModel = getEnv("MINIMAX_MODEL") ?? "abab6.5s-chat";
  }

  private async makeRequest(options: ChatOptions): Promise<MiniMaxResponse> {
    const url = `${this.baseUrl}/text/chatcompletion_v2`;
    
    const requestBody: MiniMaxRequest = {
      model: options.model || this.defaultModel,
      messages: options.messages.map((m) => ({
        role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData: MiniMaxErrorResponse = await response.json();
      const errorMessage = errorData.base_resp?.status_msg 
        ?? errorData.error?.message 
        ?? `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`MiniMax API error: ${errorMessage}`);
    }

    return response.json() as Promise<MiniMaxResponse>;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.makeRequest(options);
    
    // Add null check for response.choices[0]
    if (!response.choices || response.choices.length === 0) {
      throw new Error("MiniMax API returned no choices in response");
    }
    
    const message = response.choices[0]?.message;
    return {
      content: message?.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
      provider: this.name,
    };
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string> {
    const url = `${this.baseUrl}/text/chatcompletion_v2`;
    
    const requestBody: MiniMaxRequest = {
      model: options.model || this.defaultModel,
      messages: options.messages.map((m) => ({
        role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData: MiniMaxErrorResponse = await response.json();
      const errorMessage = errorData.base_resp?.status_msg 
        ?? errorData.error?.message 
        ?? `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`MiniMax API error: ${errorMessage}`);
    }

    if (!response.body) {
      throw new Error("Empty response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") return;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.chat({
        model: this.defaultModel,
        messages: [{ role: "user", content: "test" }],
        maxTokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  getModels(): string[] {
    return [
      "abab6.5s-chat",
      "abab6.5g-chat",
      "abab6-chat",
      "abab5.5s-chat",
      "abab5.5g-chat",
    ];
  }
}