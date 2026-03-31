/**
 * Provider Health Check - Monitoring provider availability and health
 * 
 * Provides health status for all LLM providers with configurable
 * check intervals and timeout settings.
 */

import type { ProviderName, LLMProvider } from "../shared/types.js";

// ============================================================================
// Health Check Types
// ============================================================================

export interface ProviderHealthStatus {
  provider: ProviderName;
  available: boolean;
  latencyMs: number | null;
  lastChecked: Date;
  error?: string;
}

export interface HealthCheckConfig {
  checkIntervalMs: number;
  timeoutMs: number;
  enabled: boolean;
}

// ============================================================================
// Health Monitor Class
// ============================================================================

export class ProviderHealthMonitor {
  private providers: Map<ProviderName, LLMProvider> = new Map();
  private healthStatus: Map<ProviderName, ProviderHealthStatus> = new Map();
  private config: HealthCheckConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config?: Partial<HealthCheckConfig>) {
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 60000, // Default: 1 minute
      timeoutMs: config?.timeoutMs ?? 10000, // Default: 10 seconds
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Register a provider for health monitoring
   */
  registerProvider(name: ProviderName, provider: LLMProvider): void {
    this.providers.set(name, provider);
    this.healthStatus.set(name, {
      provider: name,
      available: false,
      latencyMs: null,
      lastChecked: new Date(0),
    });
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(name: ProviderName): void {
    this.providers.delete(name);
    this.healthStatus.delete(name);
  }

  /**
   * Check health of a single provider
   */
  async checkProvider(name: ProviderName): Promise<ProviderHealthStatus> {
    const provider = this.providers.get(name);
    
    if (!provider) {
      return {
        provider: name,
        available: false,
        latencyMs: null,
        lastChecked: new Date(),
        error: "Provider not registered",
      };
    }

    const startTime = Date.now();
    
    try {
      // Wrap the availability check with a timeout
      const availablePromise = provider.isAvailable();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Health check timeout")), this.config.timeoutMs);
      });
      
      const available = await Promise.race([availablePromise, timeoutPromise]);
      const latencyMs = Date.now() - startTime;

      const status: ProviderHealthStatus = {
        provider: name,
        available,
        latencyMs,
        lastChecked: new Date(),
      };

      this.healthStatus.set(name, status);
      return status;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      const status: ProviderHealthStatus = {
        provider: name,
        available: false,
        latencyMs,
        lastChecked: new Date(),
        error: (error as Error).message,
      };

      this.healthStatus.set(name, status);
      return status;
    }
  }

  /**
   * Check health of all registered providers
   */
  async checkAllProviders(): Promise<Record<ProviderName, ProviderHealthStatus>> {
    const results: Record<ProviderName, ProviderHealthStatus> = {} as Record<ProviderName, ProviderHealthStatus>;
    
    const checkPromises = Array.from(this.providers.keys()).map(async (name) => {
      const status = await this.checkProvider(name);
      return { name, status };
    });

    const checkResults = await Promise.allSettled(checkPromises);
    
    for (const result of checkResults) {
      if (result.status === "fulfilled") {
        results[result.value.name] = result.value.status;
      }
    }

    return results;
  }

  /**
   * Get current health status for a provider
   */
  getStatus(name: ProviderName): ProviderHealthStatus | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Get all health statuses
   */
  getAllStatuses(): Record<ProviderName, ProviderHealthStatus> {
    const result: Record<ProviderName, ProviderHealthStatus> = {} as Record<ProviderName, ProviderHealthStatus>;
    
    for (const [name, status] of this.healthStatus.entries()) {
      result[name] = status;
    }
    
    return result;
  }

  /**
   * Get only available providers
   */
  getAvailableProviders(): ProviderName[] {
    const available: ProviderName[] = [];
    
    for (const [name, status] of this.healthStatus.entries()) {
      if (status.available) {
        available.push(name);
      }
    }
    
    return available;
  }

  /**
   * Start automatic health checks
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    
    // Run initial check
    this.checkAllProviders().catch((error) => {
      console.error("[HealthMonitor] Initial check failed:", error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAllProviders().catch((error) => {
        console.error("[HealthMonitor] Periodic check failed:", error);
      });
    }, this.config.checkIntervalMs);

    console.log(
      `[HealthMonitor] Started with interval ${this.config.checkIntervalMs}ms`
    );
  }

  /**
   * Stop automatic health checks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log("[HealthMonitor] Stopped");
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthCheckConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    if (this.config.enabled && wasRunning) {
      this.start();
    }
  }

  /**
   * Get configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Fallback Logic
// ============================================================================

export interface FallbackConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export class ProviderFallbackManager {
  private config: FallbackConfig;
  private retryCount: Map<ProviderName, number> = new Map();

  constructor(config?: Partial<FallbackConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
    };
  }

  /**
   * Get next available provider in fallback chain
   */
  async getNextAvailable(
    providers: Map<ProviderName, LLMProvider>,
    chain: ProviderName[],
    healthMonitor?: ProviderHealthMonitor
  ): Promise<{ provider: LLMProvider; name: ProviderName } | null> {
    if (!this.config.enabled) {
      return null;
    }

    for (const name of chain) {
      const provider = providers.get(name);
      
      if (!provider) {
        continue;
      }

      // Check health monitor if available
      if (healthMonitor) {
        const status = healthMonitor.getStatus(name);
        if (!status?.available) {
          console.log(`[FallbackManager] Skipping unavailable provider: ${name}`);
          continue;
        }
      }

      return { provider, name };
    }

    return null;
  }

  /**
   * Record a failure for a provider
   */
  recordFailure(provider: ProviderName): void {
    const current = this.retryCount.get(provider) ?? 0;
    this.retryCount.set(provider, current + 1);
  }

  /**
   * Reset failure count for a provider
   */
  resetFailure(provider: ProviderName): void {
    this.retryCount.delete(provider);
  }

  /**
   * Check if provider should be retried
   */
  shouldRetry(provider: ProviderName): boolean {
    const count = this.retryCount.get(provider) ?? 0;
    return count < this.config.maxRetries;
  }

  /**
   * Get delay before next retry
   */
  getRetryDelay(provider: ProviderName): number {
    const count = this.retryCount.get(provider) ?? 0;
    return this.config.retryDelayMs * Math.pow(2, count); // Exponential backoff
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let healthMonitorInstance: ProviderHealthMonitor | null = null;
let fallbackManagerInstance: ProviderFallbackManager | null = null;

export function getHealthMonitor(config?: Partial<HealthCheckConfig>): ProviderHealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new ProviderHealthMonitor(config);
  }
  return healthMonitorInstance;
}

export function getFallbackManager(config?: Partial<FallbackConfig>): ProviderFallbackManager {
  if (!fallbackManagerInstance) {
    fallbackManagerInstance = new ProviderFallbackManager(config);
  }
  return fallbackManagerInstance;
}