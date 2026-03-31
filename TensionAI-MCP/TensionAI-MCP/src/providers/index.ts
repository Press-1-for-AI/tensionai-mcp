/**
 * LLM Provider Pool - Multi-provider support for OpenAI, Anthropic, MiniMax, Gemini, vLLM, llama.cpp
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ChatOptions,
  ChatResponse,
  ProviderName,
} from "../shared/types.js";

// Import new providers
import { MiniMaxProvider } from "./minimax.js";
import { GeminiProvider } from "./gemini.js";
import { VLLMProvider, LlamaCppProvider, createVLLMProvider, createLlamaCppProvider } from "./local.js";
import { ProviderHealthMonitor, ProviderFallbackManager, getHealthMonitor, getFallbackManager } from "./health.js";

// ============================================================================
// Environment Configuration
// ============================================================================

function getEnv(key: string): string | undefined {
  return process.env[key];
}

// ============================================================================
// OpenAI Provider
// ============================================================================

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  public readonly name = "openai";

  constructor() {
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({ apiKey });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages as OpenAI.Chat.ChatCompletionMessage[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
    });

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
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages as OpenAI.Chat.ChatCompletionMessage[],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    });

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getModels(): string[] {
    return [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
    ];
  }
}

// ============================================================================
// Anthropic Provider
// ============================================================================

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  public readonly name = "anthropic";

  constructor() {
    const apiKey = getEnv("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic({ apiKey });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const systemMessage = options.messages.find((m) => m.role === "system");
    const conversationMessages = options.messages.filter(
      (m) => m.role !== "system"
    );

    const response = await this.client.messages.create({
      model: options.model,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    });

    const content = response.content[0];
    const textContent =
      content.type === "text" ? content.text : "No text content returned";

    return {
      content: textContent,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
      provider: this.name,
    };
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string> {
    const systemMessage = options.messages.find((m) => m.role === "system");
    const conversationMessages = options.messages.filter(
      (m) => m.role !== "system"
    );

    const stream = await this.client.messages.stream({
      model: options.model,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta") {
        const textDelta = chunk.delta;
        if (textDelta.type === "text_delta") {
          yield textDelta.text;
        }
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    // Anthropic doesn't have a simple list models API, so we try a minimal request
    try {
      await this.client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "test" }],
      });
      return true;
    } catch {
      return false;
    }
  }

  getModels(): string[] {
    return [
      "claude-sonnet-4-20250514",
      "claude-sonnet-3-5-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-haiku-20240307",
    ];
  }
}

// ============================================================================
// Provider Pool
// ============================================================================

export interface ProviderPoolConfig {
  defaultProvider?: ProviderName;
  fallbackChain?: ProviderName[];
  enableHealthMonitoring?: boolean;
  healthCheckIntervalMs?: number;
}

export class ProviderPool {
  private providers: Map<ProviderName, LLMProvider> = new Map();
  private defaultProvider: ProviderName = "openai";
  private fallbackChain: ProviderName[] = [];
  private healthMonitor: ProviderHealthMonitor;
  private fallbackManager: ProviderFallbackManager;
  private initialized: boolean = false;

  constructor(config?: ProviderPoolConfig) {
    // Initialize health monitor and fallback manager
    this.healthMonitor = getHealthMonitor({
      checkIntervalMs: config?.healthCheckIntervalMs ?? 60000,
      enabled: config?.enableHealthMonitoring ?? true,
    });

    this.fallbackManager = getFallbackManager();

    if (config?.defaultProvider) {
      this.defaultProvider = config.defaultProvider;
    }

    if (config?.fallbackChain) {
      this.fallbackChain = config.fallbackChain;
    }
  }

  /**
   * Lazily initialize providers - called on first use instead of constructor
   */
  private ensureInitialized(): void {
    if (this.initialized) return;
    this.initializeProviders();
    this.initialized = true;
  }

  private initializeProviders(): void {
    // Try to initialize OpenAI
    try {
      const provider = new OpenAIProvider();
      this.providers.set("openai", provider);
      this.healthMonitor.registerProvider("openai", provider);
      console.log("[ProviderPool] OpenAI provider initialized");
    } catch (error) {
      console.warn("[ProviderPool] OpenAI not available:", (error as Error).message);
    }

    // Try to initialize Anthropic
    try {
      const provider = new AnthropicProvider();
      this.providers.set("anthropic", provider);
      this.healthMonitor.registerProvider("anthropic", provider);
      console.log("[ProviderPool] Anthropic provider initialized");
    } catch (error) {
      console.warn("[ProviderPool] Anthropic not available:", (error as Error).message);
    }

    // Try to initialize MiniMax
    try {
      const provider = new MiniMaxProvider();
      this.providers.set("minimax", provider);
      this.healthMonitor.registerProvider("minimax", provider);
      console.log("[ProviderPool] MiniMax provider initialized");
    } catch (error) {
      console.warn("[ProviderPool] MiniMax not available:", (error as Error).message);
    }

    // Try to initialize Gemini
    try {
      const provider = new GeminiProvider();
      this.providers.set("gemini", provider);
      this.healthMonitor.registerProvider("gemini", provider);
      console.log("[ProviderPool] Gemini provider initialized");
    } catch (error) {
      console.warn("[ProviderPool] Gemini not available:", (error as Error).message);
    }

    // Try to initialize vLLM
    const vllmProvider = createVLLMProvider();
    if (vllmProvider) {
      this.providers.set("local-vllm", vllmProvider);
      this.healthMonitor.registerProvider("local-vllm", vllmProvider);
      console.log("[ProviderPool] vLLM provider initialized");
    }

    // Try to initialize llama.cpp
    const llamaCppProvider = createLlamaCppProvider();
    if (llamaCppProvider) {
      this.providers.set("local-llama", llamaCppProvider);
      this.healthMonitor.registerProvider("local-llama", llamaCppProvider);
      console.log("[ProviderPool] llama.cpp provider initialized");
    }

    // Start health monitoring
    this.healthMonitor.start();
  }

  getProvider(name?: ProviderName): LLMProvider {
    this.ensureInitialized(); // Lazy initialization on first use
    const providerName = name ?? this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider '${providerName}' is not available`);
    }

    return provider;
  }

  getProviderNames(): ProviderName[] {
    this.ensureInitialized(); // Lazy initialization
    return Array.from(this.providers.keys());
  }

  async getAvailableProviders(): Promise<Record<ProviderName, boolean>> {
    this.ensureInitialized(); // Lazy initialization
    const results: Record<ProviderName, boolean> = {} as Record<ProviderName, boolean>;

    for (const [name, provider] of this.providers.entries()) {
      results[name] = await provider.isAvailable();
    }

    return results;
  }

  async chatWithFallback(
    options: ChatOptions,
    preferredProvider?: ProviderName
  ): Promise<ChatResponse> {
    // Try preferred provider first
    const providersToTry: ProviderName[] = [];

    if (preferredProvider && this.providers.has(preferredProvider)) {
      providersToTry.push(preferredProvider);
    }

    // Add fallback chain, excluding already tried
    for (const name of this.fallbackChain) {
      if (!providersToTry.includes(name) && this.providers.has(name)) {
        providersToTry.push(name);
      }
    }

    // Add default provider if not already included
    if (!providersToTry.includes(this.defaultProvider)) {
      providersToTry.push(this.defaultProvider);
    }

    // Try each provider in order
    let lastError: Error | null = null;

    for (const providerName of providersToTry) {
      try {
        const provider = this.providers.get(providerName)!;
        
        const result = await provider.chat(options);
        
        // Reset failure count on success
        this.fallbackManager.resetFailure(providerName);
        
        return result;
      } catch (error) {
        // Record failure after failed attempt
        this.fallbackManager.recordFailure(providerName);
        
        lastError = error as Error;
        console.warn(
          `[ProviderPool] Provider '${providerName}' failed:`,
          (error as Error).message
        );
        
        // Check if we should retry
        if (this.fallbackManager.shouldRetry(providerName)) {
          const delay = this.fallbackManager.getRetryDelay(providerName);
          console.log(`[ProviderPool] Retrying ${providerName} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry the same provider
          try {
            const provider = this.providers.get(providerName)!;
            const result = await provider.chat(options);
            this.fallbackManager.resetFailure(providerName);
            return result;
          } catch (retryError) {
            lastError = retryError as Error;
            console.warn(`[ProviderPool] Retry failed for '${providerName}':`, (retryError as Error).message);
          }
        }
      }
    }

    throw lastError ?? new Error("No providers available");
  }

  setDefaultProvider(name: ProviderName): void {
    this.ensureInitialized();
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' is not available`);
    }
    this.defaultProvider = name;
  }

  setFallbackChain(chain: ProviderName[]): void {
    this.ensureInitialized();
    this.fallbackChain = chain;
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  getHealthStatus(): ReturnType<ProviderHealthMonitor["getAllStatuses"]> {
    this.ensureInitialized();
    return this.healthMonitor.getAllStatuses();
  }

  async checkHealth(): Promise<ReturnType<ProviderHealthMonitor["checkAllProviders"]>> {
    this.ensureInitialized();
    return this.healthMonitor.checkAllProviders();
  }

  startHealthMonitoring(): void {
    this.healthMonitor.start();
  }

  stopHealthMonitoring(): void {
    this.healthMonitor.stop();
  }

  // ============================================================================
  // Model Switching
  // ============================================================================

  getAvailableModels(): Record<ProviderName, string[]> {
    this.ensureInitialized();
    const result: Record<ProviderName, string[]> = {} as Record<ProviderName, string[]>;

    for (const [name, provider] of this.providers.entries()) {
      result[name] = provider.getModels();
    }

    return result;
  }

  getModelsForProvider(providerName: ProviderName): string[] | null {
    this.ensureInitialized();
    const provider = this.providers.get(providerName);
    return provider ? provider.getModels() : null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let providerPoolInstance: ProviderPool | null = null;

export function getProviderPool(config?: ProviderPoolConfig): ProviderPool {
  if (!providerPoolInstance) {
    providerPoolInstance = new ProviderPool(config);
  }
  return providerPoolInstance;
}

export function initializeProviders(config?: ProviderPoolConfig): ProviderPool {
  providerPoolInstance = new ProviderPool(config);
  return providerPoolInstance;
}

// Re-export health monitoring types for external use
export type { ProviderHealthStatus } from "./health.js";
export type { FallbackConfig } from "./health.js";