/**
 * Token & Cost Tracking - Metrics for LLM usage and cost calculation
 * 
 * Tracks token usage across providers and calculates estimated costs
 * based on provider-specific pricing.
 */

import type { ProviderName, ChatResponse } from "../shared/types.js";

// ============================================================================
// Pricing Configuration (per 1M tokens)
// ============================================================================

export interface ProviderPricing {
  inputPer1M: number;
  outputPer1M: number;
}

// Default prices in USD (can be overridden via environment)
const DEFAULT_PRICING: Record<ProviderName, ProviderPricing> = {
  "openai": {
    inputPer1M: 2.50,    // GPT-4o input
    outputPer1M: 10.00,  // GPT-4o output
  },
  "anthropic": {
    inputPer1M: 3.00,    // Claude 3.5 Sonnet input
    outputPer1M: 15.00,  // Claude 3.5 Sonnet output
  },
  "minimax": {
    inputPer1M: 1.00,    // MiniMax pricing (estimate)
    outputPer1M: 1.00,
  },
  "gemini": {
    inputPer1M: 0.00,    // Gemini 2.0 Flash (free tier)
    outputPer1M: 0.00,
  },
  "local-vllm": {
    inputPer1M: 0.00,    // Local - no API cost
    outputPer1M: 0.00,
  },
  "local-llama": {
    inputPer1M: 0.00,    // Local - no API cost
    outputPer1M: 0.00,
  },
};

// ============================================================================
// Usage Tracking Types
// ============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface RequestMetrics {
  requestId: string;
  provider: ProviderName;
  model: string;
  timestamp: Date;
  tokens: TokenUsage;
  cost: CostCalculation;
  durationMs: number;
}

// ============================================================================
// Token Counter Class
// ============================================================================

export class TokenCounter {
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private requestCount: number = 0;

  /**
   * Add token usage from a response
   */
  addUsage(response: ChatResponse): void {
    this.totalInputTokens += response.usage.inputTokens;
    this.totalOutputTokens += response.usage.outputTokens;
    this.requestCount++;
  }

  /**
   * Add token usage from values
   */
  addTokens(inputTokens: number, outputTokens: number): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.requestCount++;
  }

  /**
   * Get current usage
   */
  getUsage(): TokenUsage {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset counters
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
  }

  /**
   * Merge another counter's values
   */
  merge(other: TokenCounter): void {
    const otherUsage = other.getUsage();
    this.totalInputTokens += otherUsage.inputTokens;
    this.totalOutputTokens += otherUsage.outputTokens;
    this.requestCount += other.getRequestCount();
  }
}

// ============================================================================
// Cost Calculator Class
// ============================================================================

export class CostCalculator {
  private pricing: Record<ProviderName, ProviderPricing>;
  private customPricing: Map<string, ProviderPricing> = new Map();

  constructor() {
    this.pricing = { ...DEFAULT_PRICING };
    this.loadCustomPricing();
  }

  /**
   * Load custom pricing from environment variables
   */
  private loadCustomPricing(): void {
    // Check for custom pricing in environment
    const env = process.env;
    
    for (const provider of Object.keys(DEFAULT_PRICING) as ProviderName[]) {
      const inputKey = `${provider.toUpperCase()}_INPUT_PRICE`;
      const outputKey = `${provider.toUpperCase()}_OUTPUT_PRICE`;
      
      if (env[inputKey] || env[outputKey]) {
        this.customPricing.set(provider, {
          inputPer1M: parseFloat(env[inputKey] ?? "0"),
          outputPer1M: parseFloat(env[outputKey] ?? "0"),
        });
      }
    }
  }

  /**
   * Get effective pricing for a provider
   */
  getPricing(provider: ProviderName): ProviderPricing {
    return this.customPricing.get(provider) ?? this.pricing[provider] ?? {
      inputPer1M: 0,
      outputPer1M: 0,
    };
  }

  /**
   * Calculate cost from token usage
   */
  calculateCost(provider: ProviderName, usage: TokenUsage): CostCalculation {
    const pricing = this.getPricing(provider);
    
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
    
    return {
      inputCost: Math.round(inputCost * 100000) / 100000, // Round to 5 decimal places
      outputCost: Math.round(outputCost * 100000) / 100000,
      totalCost: Math.round((inputCost + outputCost) * 100000) / 100000,
      currency: "USD",
    };
  }

  /**
   * Calculate cost from ChatResponse
   */
  calculateCostFromResponse(response: ChatResponse): CostCalculation {
    const provider = response.provider as ProviderName;
    return this.calculateCost(provider, {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.inputTokens + response.usage.outputTokens,
    });
  }

  /**
   * Update pricing for a provider
   */
  setPricing(provider: ProviderName, inputPer1M: number, outputPer1M: number): void {
    this.customPricing.set(provider, {
      inputPer1M,
      outputPer1M,
    });
  }

  /**
   * Get all current pricing
   */
  getAllPricing(): Record<ProviderName, ProviderPricing> {
    const result: Record<ProviderName, ProviderPricing> = {} as Record<ProviderName, ProviderPricing>;
    
    for (const provider of Object.keys(this.pricing) as ProviderName[]) {
      result[provider] = this.getPricing(provider);
    }
    
    return result;
  }
}

// ============================================================================
// Metrics Collector Class
// ============================================================================

export class MetricsCollector {
  private tokenCounter: TokenCounter;
  private costCalculator: CostCalculator;
  private requestHistory: RequestMetrics[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    this.tokenCounter = new TokenCounter();
    this.costCalculator = new CostCalculator();
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Record a request
   */
  recordRequest(
    requestId: string,
    response: ChatResponse,
    durationMs: number
  ): RequestMetrics {
    const provider = response.provider as ProviderName;
    
    const tokens: TokenUsage = {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.inputTokens + response.usage.outputTokens,
    };
    
    const cost = this.costCalculator.calculateCostFromResponse(response);
    
    const metrics: RequestMetrics = {
      requestId,
      provider,
      model: response.model,
      timestamp: new Date(),
      tokens,
      cost,
      durationMs,
    };
    
    // Update counter
    this.tokenCounter.addTokens(tokens.inputTokens, tokens.outputTokens);
    
    // Add to history
    this.requestHistory.push(metrics);
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
    
    return metrics;
  }

  /**
   * Get aggregate metrics
   */
  getAggregateMetrics(): {
    totalRequests: number;
    tokens: TokenUsage;
    cost: CostCalculation;
    averageDurationMs: number;
  } {
    const usage = this.tokenCounter.getUsage();
    const requestCount = this.tokenCounter.getRequestCount();
    
    // Calculate total cost across all providers
    let totalInputCost = 0;
    let totalOutputCost = 0;
    
    for (const request of this.requestHistory) {
      totalInputCost += request.cost.inputCost;
      totalOutputCost += request.cost.outputCost;
    }
    
    const avgDuration = requestCount > 0
      ? this.requestHistory.reduce((sum, r) => sum + r.durationMs, 0) / requestCount
      : 0;
    
    return {
      totalRequests: requestCount,
      tokens: usage,
      cost: {
        inputCost: Math.round(totalInputCost * 100000) / 100000,
        outputCost: Math.round(totalOutputCost * 100000) / 100000,
        totalCost: Math.round((totalInputCost + totalOutputCost) * 100000) / 100000,
        currency: "USD",
      },
      averageDurationMs: Math.round(avgDuration),
    };
  }

  /**
   * Get metrics by provider
   */
  getMetricsByProvider(): Record<ProviderName, {
    requestCount: number;
    tokens: TokenUsage;
    cost: CostCalculation;
  }> {
    const result: Record<ProviderName, {
      requestCount: number;
      tokens: TokenUsage;
      cost: CostCalculation;
    }> = {} as Record<ProviderName, {
      requestCount: number;
      tokens: TokenUsage;
      cost: CostCalculation;
    }>;
    
    for (const request of this.requestHistory) {
      const provider = request.provider;
      
      if (!result[provider]) {
        result[provider] = {
          requestCount: 0,
          tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: "USD" },
        };
      }
      
      result[provider].requestCount++;
      result[provider].tokens.inputTokens += request.tokens.inputTokens;
      result[provider].tokens.outputTokens += request.tokens.outputTokens;
      result[provider].tokens.totalTokens += request.tokens.totalTokens;
      result[provider].cost.inputCost += request.cost.inputCost;
      result[provider].cost.outputCost += request.cost.outputCost;
      result[provider].cost.totalCost += request.cost.totalCost;
    }
    
    // Round values
    for (const provider of Object.keys(result) as ProviderName[]) {
      result[provider].cost.inputCost = Math.round(result[provider].cost.inputCost * 100000) / 100000;
      result[provider].cost.outputCost = Math.round(result[provider].cost.outputCost * 100000) / 100000;
      result[provider].cost.totalCost = Math.round(result[provider].cost.totalCost * 100000) / 100000;
    }
    
    return result;
  }

  /**
   * Get recent request history
   */
  getHistory(limit?: number): RequestMetrics[] {
    if (limit) {
      return this.requestHistory.slice(-limit);
    }
    return [...this.requestHistory];
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.tokenCounter.reset();
    this.requestHistory = [];
  }

  /**
   * Get cost calculator for external use
   */
  getCostCalculator(): CostCalculator {
    return this.costCalculator;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let metricsCollectorInstance: MetricsCollector | null = null;

export function getMetricsCollector(maxHistorySize?: number): MetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = new MetricsCollector(maxHistorySize);
  }
  return metricsCollectorInstance;
}

export function createMetricsCollector(maxHistorySize?: number): MetricsCollector {
  return new MetricsCollector(maxHistorySize);
}