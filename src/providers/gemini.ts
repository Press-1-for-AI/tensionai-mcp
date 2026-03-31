/**
 * Gemini Provider - Support for Google Gemini API
 * 
 * Google's Gemini models through the Gemini API.
 * API documentation: https://ai.google.dev/docs
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
// Gemini API Types
// ============================================================================

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{
    text: string;
  }>;
}

interface GeminiSafetyRating {
  category: string;
  probability: string;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  safetyRatings?: GeminiSafetyRating[];
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    safetyRatings: GeminiSafetyRating[];
  };
}

interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

// ============================================================================
// Gemini Provider
// ============================================================================

export class GeminiProvider implements LLMProvider {
  public readonly name = "gemini";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = getEnv("GOOGLE_API_KEY") ?? "";
    if (!this.apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is required");
    }
    
    // Gemini API base URL
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    this.defaultModel = getEnv("GEMINI_MODEL") ?? "gemini-2.0-flash-exp";
  }

  private convertMessages(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): GeminiContent[] {
    const contents: GeminiContent[] = [];
    
    for (const msg of messages) {
      // Gemini uses "user" and "model" roles
      const role = msg.role === "assistant" ? "model" : "user";
      
      // Skip system messages in Gemini format - they go in system instruction instead
      if (msg.role === "system") continue;
      
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
    
    return contents;
  }

  private getSystemInstruction(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): string | undefined {
    const systemMsg = messages.find(m => m.role === "system");
    return systemMsg?.content;
  }

  private async makeRequest(options: ChatOptions): Promise<GeminiResponse> {
    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    
    // Convert messages to Gemini format
    const contents = this.convertMessages(options.messages);
    const systemInstruction = this.getSystemInstruction(options.messages);
    
    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };
    
    // Add system instruction if present
    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData: GeminiError = await response.json();
      const errorMessage = errorData.error?.message 
        ?? `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Gemini API error: ${errorMessage}`);
    }

    return response.json() as Promise<GeminiResponse>;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.makeRequest(options);
    
    // Add null check for candidate
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error("Gemini API returned no candidates in response");
    }
    
    const content = candidate?.content?.parts?.[0]?.text ?? "";
    
    return {
      content,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model: options.model || this.defaultModel,
      provider: this.name,
    };
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string> {
    const model = options.model || this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    
    // Convert messages to Gemini format
    const contents = this.convertMessages(options.messages);
    const systemInstruction = this.getSystemInstruction(options.messages);
    
    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };
    
    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData: GeminiError = await response.json();
      const errorMessage = errorData.error?.message 
        ?? `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(`Gemini API error: ${errorMessage}`);
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
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
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
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
    ];
  }
}