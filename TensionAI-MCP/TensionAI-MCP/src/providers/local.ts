/**
 * Local Providers - Support for vLLM and llama.cpp
 * 
 * These providers connect to locally running LLM servers:
 * - vLLM: High-performance LLM serving engine (https://github.com/vllm-project/vllm)
 * - llama.cpp: CPU-efficient inference with GGUF models (https://github.com/ggerganov/llama.cpp)
 */

import type {
  LLMProvider,
  ChatOptions,
  ChatResponse,
  ProviderName,
} from "../shared/types.js";

// ============================================================================
// Environment Configuration
// ============================================================================

function getEnv(key: string): string | undefined {
  return process.env[key];
}

// ============================================================================
// vLLM Provider
// ============================================================================

interface VLLMMessage {
  role: string;
  content: string;
}

interface VLLMRequest {
  model: string;
  messages: VLLMMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface VLLMResponse {
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

export class VLLMProvider implements LLMProvider {
  public readonly name: ProviderName = "local-vllm";
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = getEnv("VLLM_BASE_URL") ?? "http://localhost:8000";
    this.defaultModel = getEnv("VLLM_MODEL") ?? "llama-3-8b";
  }

  private convertMessages(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): VLLMMessage[] {
    return messages.map((m) => ({
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  }

  private async makeRequest(options: ChatOptions, stream: boolean = false): Promise<VLLMResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    const requestBody: VLLMRequest = {
      model: options.model || this.defaultModel,
      messages: this.convertMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<VLLMResponse>;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.makeRequest(options, false);
    
    // Add null check for response.choices[0]
    if (!response.choices || response.choices.length === 0) {
      throw new Error("Local vLLM API returned no choices in response");
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
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    const requestBody: VLLMRequest = {
      model: options.model || this.defaultModel,
      messages: this.convertMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM API error (${response.status}): ${errorText}`);
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
      const response = await fetch(`${this.baseUrl}/models`);
      return response.ok;
    } catch {
      return false;
    }
  }

  getModels(): string[] {
    // vLLM doesn't have a standard model list API in the same way
    // Return common models as defaults
    return [
      "llama-3-8b",
      "llama-3-70b",
      "llama-2-70b",
      "mixtral-8x7b",
      "qwen-72b",
    ];
  }
}

// ============================================================================
// llama.cpp Provider
// ============================================================================

interface LlamaCppMessage {
  role: string;
  content: string;
}

interface LlamaCppRequest {
  model: string;
  messages: LlamaCppMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LlamaCppResponse {
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

export class LlamaCppProvider implements LLMProvider {
  public readonly name: ProviderName = "local-llama";
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = getEnv("LLAMA_CPP_URL") ?? "http://localhost:8080";
    this.defaultModel = getEnv("LLAMA_CPP_MODEL") ?? "llama-3-8b";
  }

  private convertMessages(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): LlamaCppMessage[] {
    return messages.map((m) => ({
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  }

  private async makeRequest(options: ChatOptions, stream: boolean = false): Promise<LlamaCppResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    const requestBody: LlamaCppRequest = {
      model: options.model || this.defaultModel,
      messages: this.convertMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<LlamaCppResponse>;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.makeRequest(options, false);
    
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
    const url = `${this.baseUrl}/v1/chat/completions`;
    
    const requestBody: LlamaCppRequest = {
      model: options.model || this.defaultModel,
      messages: this.convertMessages(options.messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp API error (${response.status}): ${errorText}`);
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
      const response = await fetch(`${this.baseUrl}/v1/models`);
      return response.ok;
    } catch {
      return false;
    }
  }

  getModels(): string[] {
    // llama.cpp doesn't have a standard model list API
    return [
      "llama-3-8b",
      "llama-2-70b",
      "mistral-7b",
      "codellama-34b",
      "mixtral-8x7b",
    ];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createVLLMProvider(): VLLMProvider | null {
  try {
    return new VLLMProvider();
  } catch (error) {
    console.warn("[LocalProviders] vLLM not available:", (error as Error).message);
    return null;
  }
}

export function createLlamaCppProvider(): LlamaCppProvider | null {
  try {
    return new LlamaCppProvider();
  } catch (error) {
    console.warn("[LocalProviders] llama.cpp not available:", (error as Error).message);
    return null;
  }
}