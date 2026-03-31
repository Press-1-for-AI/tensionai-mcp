/**
 * Rate Limiting - Per-API key rate limiting with configurable limits
 * 
 * Provides per-API key rate limiting, configurable limits per project,
 * and request throttling.
 * 
 * Supports both in-memory and Redis backends.
 */

import type { ProviderName } from "../shared/types.js";

// ============================================================================
// Rate Limit Types
// ============================================================================

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxTokensPerMinute: number;
  maxTokensPerHour: number;
  burstLimit: number;
}

export interface APIKeyLimits {
  apiKey: string;
  projectId?: string;
  provider?: ProviderName;
  limits: RateLimitConfig;
}

export interface RateLimitStatus {
  allowed: boolean;
  remainingRequests: number;
  remainingTokens: number;
  resetAt: Date;
  retryAfter?: number; // seconds to wait if not allowed
}

export interface RequestRecord {
  timestamp: Date;
  tokens: number;
  projectId?: string;
}

export interface RateLimitOptions {
  useRedis?: boolean;
  redisUrl?: string;
}

// ============================================================================
// Rate Limiter Class
// ============================================================================

export class RateLimiter {
  private limits: Map<string, APIKeyLimits> = new Map();
  private requestHistory: Map<string, RequestRecord[]> = new Map();
  private defaultLimits: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<RateLimitConfig>) {
    this.defaultLimits = {
      maxRequestsPerMinute: config?.maxRequestsPerMinute ?? 60,
      maxRequestsPerHour: config?.maxRequestsPerHour ?? 1000,
      maxTokensPerMinute: config?.maxTokensPerMinute ?? 100000,
      maxTokensPerHour: config?.maxTokensPerHour ?? 1000000,
      burstLimit: config?.burstLimit ?? 10,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Set rate limits for an API key
   */
  setLimits(apiKey: string, limits: Partial<RateLimitConfig>, projectId?: string, provider?: ProviderName): void {
    const key = this.getKey(apiKey, projectId);
    
    this.limits.set(key, {
      apiKey,
      projectId,
      provider,
      limits: {
        ...this.defaultLimits,
        ...limits,
      },
    });

    console.log(`[RateLimiter] Set limits for key ${this.maskApiKey(apiKey)}:`, limits);
  }

  /**
   * Check if request is allowed
   */
  checkRequest(apiKey: string, estimatedTokens: number = 0, projectId?: string): RateLimitStatus {
    const key = this.getKey(apiKey, projectId);
    const limits = this.limits.get(key)?.limits ?? this.defaultLimits;

    const history = this.requestHistory.get(key) ?? [];
    const now = new Date();

    // Clean old history
    const recentHistory = history.filter(r => 
      now.getTime() - r.timestamp.getTime() < 3600000 // Last hour
    );

    // Check minute limits
    const minuteAgo = new Date(now.getTime() - 60000);
    const requestsLastMinute = recentHistory.filter(r => r.timestamp > minuteAgo).length;
    const tokensLastMinute = recentHistory
      .filter(r => r.timestamp > minuteAgo)
      .reduce((sum, r) => sum + r.tokens, 0);

    // Check burst limit
    const secondsAgo = new Date(now.getTime() - 1000);
    const requestsLastSecond = recentHistory.filter(r => r.timestamp > secondsAgo).length;

    if (requestsLastSecond >= limits.burstLimit) {
      return {
        allowed: false,
        remainingRequests: 0,
        remainingTokens: limits.maxTokensPerMinute - tokensLastMinute,
        resetAt: new Date(now.getTime() + 1000),
        retryAfter: 1,
      };
    }

    // Check requests per minute
    if (requestsLastMinute >= limits.maxRequestsPerMinute) {
      const oldestRequest = recentHistory
        .filter(r => r.timestamp > minuteAgo)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      
      const retryAfter = oldestRequest 
        ? Math.ceil((oldestRequest.timestamp.getTime() + 60000 - now.getTime()) / 1000)
        : 60;

      return {
        allowed: false,
        remainingRequests: 0,
        remainingTokens: limits.maxTokensPerMinute - tokensLastMinute,
        resetAt: new Date(now.getTime() + 60000),
        retryAfter,
      };
    }

    // Check tokens per minute
    if (tokensLastMinute + estimatedTokens > limits.maxTokensPerMinute) {
      return {
        allowed: false,
        remainingRequests: limits.maxRequestsPerMinute - requestsLastMinute,
        remainingTokens: 0,
        resetAt: new Date(now.getTime() + 60000),
        retryAfter: 60,
      };
    }

    // Check hour limits (for reporting)
    const hourAgo = new Date(now.getTime() - 3600000);
    const requestsLastHour = recentHistory.filter(r => r.timestamp > hourAgo).length;
    const tokensLastHour = recentHistory
      .filter(r => r.timestamp > hourAgo)
      .reduce((sum, r) => sum + r.tokens, 0);

    return {
      allowed: true,
      remainingRequests: Math.max(0, limits.maxRequestsPerMinute - requestsLastMinute - 1),
      remainingTokens: Math.max(0, limits.maxTokensPerMinute - tokensLastMinute - estimatedTokens),
      resetAt: new Date(now.getTime() + 60000),
    };
  }

  /**
   * Record a request
   */
  recordRequest(apiKey: string, tokens: number, projectId?: string): void {
    const key = this.getKey(apiKey, projectId);
    
    if (!this.requestHistory.has(key)) {
      this.requestHistory.set(key, []);
    }

    this.requestHistory.get(key)!.push({
      timestamp: new Date(),
      tokens,
      projectId,
    });

    // Cleanup old entries periodically
    this.cleanupKey(key);
  }

  /**
   * Get current status for an API key
   */
  getStatus(apiKey: string, projectId?: string): {
    limits: RateLimitConfig;
    currentUsage: {
      requestsLastMinute: number;
      requestsLastHour: number;
      tokensLastMinute: number;
      tokensLastHour: number;
    };
  } | null {
    const key = this.getKey(apiKey, projectId);
    const limits = this.limits.get(key)?.limits ?? this.defaultLimits;
    const history = this.requestHistory.get(key) ?? [];
    const now = new Date();

    // Calculate current usage
    const minuteAgo = new Date(now.getTime() - 60000);
    const hourAgo = new Date(now.getTime() - 3600000);

    const requestsLastMinute = history.filter(r => r.timestamp > minuteAgo).length;
    const requestsLastHour = history.filter(r => r.timestamp > hourAgo).length;
    const tokensLastMinute = history
      .filter(r => r.timestamp > minuteAgo)
      .reduce((sum, r) => sum + r.tokens, 0);
    const tokensLastHour = history
      .filter(r => r.timestamp > hourAgo)
      .reduce((sum, r) => sum + r.tokens, 0);

    return {
      limits,
      currentUsage: {
        requestsLastMinute,
        requestsLastHour,
        tokensLastMinute,
        tokensLastHour,
      },
    };
  }

  /**
   * Remove rate limits for an API key
   */
  removeLimits(apiKey: string, projectId?: string): boolean {
    const key = this.getKey(apiKey, projectId);
    const deleted = this.limits.delete(key);
    if (deleted) {
      console.log(`[RateLimiter] Removed limits for key ${this.maskApiKey(apiKey)}`);
    }
    return deleted;
  }

  /**
   * Get all configured limits
   */
  getAllLimits(): APIKeyLimits[] {
    return Array.from(this.limits.values());
  }

  /**
   * Update default limits
   */
  updateDefaultLimits(limits: Partial<RateLimitConfig>): void {
    this.defaultLimits = {
      ...this.defaultLimits,
      ...limits,
    };
    console.log("[RateLimiter] Updated default limits:", this.defaultLimits);
  }

  /**
   * Get default limits
   */
  getDefaultLimits(): RateLimitConfig {
    return { ...this.defaultLimits };
  }

  /**
   * Reset all rate limit data
   */
  reset(): void {
    this.limits.clear();
    this.requestHistory.clear();
    console.log("[RateLimiter] Reset all rate limit data");
  }

  /**
   * Generate unique key from API key and project
   */
  private getKey(apiKey: string, projectId?: string): string {
    return projectId ? `${apiKey}:${projectId}` : apiKey;
  }

  /**
   * Mask API key for logging
   */
  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return "****";
    }
    return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length - 4);
  }

  /**
   * Cleanup old entries for a key
   */
  private cleanupKey(key: string): void {
    const history = this.requestHistory.get(key);
    if (!history) return;

    const hourAgo = new Date(Date.now() - 3600000);
    const cleaned = history.filter(r => r.timestamp > hourAgo);
    
    if (cleaned.length !== history.length) {
      this.requestHistory.set(key, cleaned);
    }
  }

  /**
   * Start periodic cleanup - reduced frequency to every 5 minutes for better performance
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const key of this.requestHistory.keys()) {
        this.cleanupKey(key);
      }
    }, 300000); // Every 5 minutes instead of every minute
  }

  /**
   * Stop cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ============================================================================
// Token Bucket Implementation
// ============================================================================

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   */
  consume(tokens: number): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * Get available tokens
   */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const newTokens = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Wait until tokens available
   */
  async waitForTokens(tokens: number): Promise<void> {
    while (!this.consume(tokens)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

export function createRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  return new RateLimiter(config);
}

// ============================================================================
// Redis Backend Support
// ============================================================================

/**
 * Redis-based rate limiting backend for distributed systems
 * 
 * To use Redis, set environment variables:
 * - REDIS_URL=redis://localhost:6379
 * - Or configure via RateLimitOptions.redisUrl
 */

let redisClient: any = null;

async function getRedisClient(): Promise<any | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    const Redis = (await import("ioredis")).default;
    if (!redisClient) {
      redisClient = new Redis(redisUrl);
      await redisClient.ping();
      console.log("[RateLimiter] Redis connected successfully");
    }
    return redisClient;
  } catch (error) {
    console.warn("[RateLimiter] Redis not available, using in-memory fallback:", (error as Error).message);
    return null;
  }
}

/**
 * Check if Redis is configured and available
 */
export async function isRedisRateLimitAvailable(): Promise<boolean> {
  const client = await getRedisClient();
  return client !== null;
}

/**
 * Record a request in Redis for distributed rate limiting
 */
export async function recordRedisRequest(
  apiKey: string,
  tokens: number,
  projectId?: string
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  try {
    const key = `ratelimit:${apiKey}:${projectId || "default"}`;
    const now = Date.now();
    
    // Add timestamp to sorted set
    await client.zadd(key, now, `${now}:${tokens}`);
    
    // Expire old entries after 1 hour
    await client.expire(key, 3600);
    
    return true;
  } catch (error) {
    console.error("[RateLimiter] Failed to record in Redis:", (error as Error).message);
    return false;
  }
}

/**
 * Get request count from Redis for a time window
 */
export async function getRedisRequestCount(
  apiKey: string,
  projectId: string | undefined,
  windowMs: number
): Promise<number> {
  const client = await getRedisClient();
  if (!client) return 0;

  try {
    const key = `ratelimit:${apiKey}:${projectId || "default"}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    
    // Remove old entries and count remaining
    await client.zremrangebyscore(key, 0, cutoff);
    return await client.zcard(key);
  } catch (error) {
    console.error("[RateLimiter] Failed to get count from Redis:", (error as Error).message);
    return 0;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("[RateLimiter] Redis connection closed");
  }
}