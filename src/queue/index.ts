/**
 * Request Queue - Priority-based task queue with concurrency limits
 * 
 * Provides priority-based queuing, request status tracking,
 * and configurable concurrency limits per project.
 * 
 * Supports both in-memory and Redis backends.
 */

import type { TaskRequest, TaskStatus, QualityLevel } from "../shared/types.js";

// ============================================================================
// Queue Types
// ============================================================================

export type QueueStatus = "queued" | "processing" | "completed" | "failed" | "aborted";
export type PriorityLevel = "urgent" | "high" | "normal" | "low";

export interface QueuedRequest {
  id: string;
  taskRequest: TaskRequest;
  priority: PriorityLevel;
  status: QueueStatus;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: string;
}

export interface QueueConfig {
  maxConcurrentPerProject: number;
  maxQueueSizePerProject: number;
  defaultPriority: PriorityLevel;
  processingTimeoutMs: number;
  useRedis?: boolean;
  redisUrl?: string;
}

// ============================================================================
// Priority Comparator
// ============================================================================

function comparePriority(a: PriorityLevel, b: PriorityLevel): number {
  const priorities: Record<PriorityLevel, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  return priorities[a] - priorities[b];
}

// ============================================================================
// Request Queue Class
// ============================================================================

export class RequestQueue {
  private queues: Map<string, QueuedRequest[]> = new Map();
  private processing: Map<string, Set<string>> = new Map();
  private config: QueueConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private lastCleanupTime: number = 0;
  private readonly CLEANUP_INTERVAL_MS = 60000; // Clean up every minute instead of every update
  private readonly CLEANUP_THRESHOLD = 100; // Only cleanup if more than 100 requests

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      maxConcurrentPerProject: config?.maxConcurrentPerProject ?? 5,
      maxQueueSizePerProject: config?.maxQueueSizePerProject ?? 100,
      defaultPriority: config?.defaultPriority ?? "normal",
      processingTimeoutMs: config?.processingTimeoutMs ?? 300000, // 5 minutes
    };

    // Start periodic cleanup instead of cleanup on every update
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup - runs every minute instead of on every update
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.periodicCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Periodic cleanup that runs on interval rather than every update
   */
  private periodicCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL_MS) {
      return; // Skip if not enough time has passed
    }

    this.lastCleanupTime = now;
    for (const [projectId, queue] of this.queues.entries()) {
      // Only cleanup if queue has significant size
      if (queue.length > this.CLEANUP_THRESHOLD) {
        this.cleanupQueue(projectId);
      }
    }
  }

  /**
   * Add a request to the queue
   */
  enqueue(request: TaskRequest, priority?: PriorityLevel): QueuedRequest {
    const projectId = request.projectId || "default";
    const priorityLevel = priority ?? this.config.defaultPriority;

    // Check queue size limit
    const queue = this.queues.get(projectId) || [];
    if (queue.length >= this.config.maxQueueSizePerProject) {
      throw new Error(`Queue full for project ${projectId}. Maximum ${this.config.maxQueueSizePerProject} requests allowed.`);
    }

    const queuedRequest: QueuedRequest = {
      id: request.id,
      taskRequest: request,
      priority: priorityLevel,
      status: "queued",
      queuedAt: new Date(),
    };

    // Add to queue and sort by priority
    queue.push(queuedRequest);
    queue.sort((a, b) => comparePriority(a.priority, b.priority));
    this.queues.set(projectId, queue);

    console.log(`[Queue] Request ${request.id} enqueued with priority ${priorityLevel} for project ${projectId}`);

    return queuedRequest;
  }

  /**
   * Get next available request for processing
   */
  dequeue(projectId?: string): QueuedRequest | null {
    // If project specified, check that project's queue
    if (projectId) {
      return this.dequeueForProject(projectId);
    }

    // Otherwise, check all projects for available requests
    for (const [pid, queue] of this.queues.entries()) {
      const request = this.dequeueForProject(pid);
      if (request) {
        return request;
      }
    }

    return null;
  }

  /**
   * Get next request for a specific project
   */
  private dequeueForProject(projectId: string): QueuedRequest | null {
    const queue = this.queues.get(projectId);
    if (!queue || queue.length === 0) {
      return null;
    }

    // Check concurrency limit
    const currentlyProcessing = this.processing.get(projectId)?.size || 0;
    if (currentlyProcessing >= this.config.maxConcurrentPerProject) {
      return null;
    }

    // Get next queued request
    const request = queue.find(r => r.status === "queued");
    if (!request) {
      return null;
    }

    // Update status to processing
    request.status = "processing";
    request.startedAt = new Date();

    // Track in processing set
    if (!this.processing.has(projectId)) {
      this.processing.set(projectId, new Set());
    }
    this.processing.get(projectId)!.add(request.id);

    console.log(`[Queue] Request ${request.id} dequeued for processing from project ${projectId}`);

    return request;
  }

  /**
   * Mark a request as completed
   */
  complete(requestId: string, result?: string): QueuedRequest | null {
    return this.updateStatus(requestId, "completed", result);
  }

  /**
   * Mark a request as failed
   */
  fail(requestId: string, error: string): QueuedRequest | null {
    return this.updateStatus(requestId, "failed", undefined, error);
  }

  /**
   * Mark a request as aborted
   */
  abort(requestId: string): QueuedRequest | null {
    return this.updateStatus(requestId, "aborted");
  }

  /**
   * Update request status
   */
  private updateStatus(
    requestId: string,
    status: QueueStatus,
    result?: string,
    error?: string
  ): QueuedRequest | null {
    for (const [projectId, queue] of this.queues.entries()) {
      const request = queue.find(r => r.id === requestId);
      if (request) {
        request.status = status;
        request.completedAt = new Date();
        
        if (result) {
          request.result = result;
        }
        if (error) {
          request.error = error;
        }

        // Remove from processing set
        this.processing.get(projectId)?.delete(requestId);

        // Removed cleanup on every update - now handled by periodic cleanup for performance

        console.log(`[Queue] Request ${requestId} status updated to ${status}`);
        return request;
      }
    }
    return null;
  }

  /**
   * Get queue status for a project
   */
  getQueueStatus(projectId?: string): {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const stats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    const queuesToCheck = projectId 
      ? [[projectId, this.queues.get(projectId) || []] as const]
      : this.queues.entries();

    for (const [, queue] of queuesToCheck) {
      for (const request of queue) {
        stats.total++;
        switch (request.status) {
          case "queued":
            stats.queued++;
            break;
          case "processing":
            stats.processing++;
            break;
          case "completed":
            stats.completed++;
            break;
          case "failed":
          case "aborted":
            stats.failed++;
            break;
        }
      }
    }

    return stats;
  }

  /**
   * Get request by ID
   */
  getRequest(requestId: string): QueuedRequest | null {
    for (const queue of this.queues.values()) {
      const request = queue.find(r => r.id === requestId);
      if (request) {
        return request;
      }
    }
    return null;
  }

  /**
   * Get all queued requests for a project
   */
  getQueuedRequests(projectId: string): QueuedRequest[] {
    const queue = this.queues.get(projectId);
    return queue ? queue.filter(r => r.status === "queued") : [];
  }

  /**
   * Get all processing requests for a project
   */
  getProcessingRequests(projectId: string): QueuedRequest[] {
    const queue = this.queues.get(projectId);
    return queue ? queue.filter(r => r.status === "processing") : [];
  }

  /**
   * Check if project can accept more requests
   */
  canAcceptRequest(projectId: string): boolean {
    const queue = this.queues.get(projectId) || [];
    const processing = this.processing.get(projectId)?.size || 0;
    
    return (
      queue.length < this.config.maxQueueSizePerProject &&
      processing < this.config.maxConcurrentPerProject
    );
  }

  /**
   * Update priority of a queued request
   */
  setPriority(requestId: string, priority: PriorityLevel): boolean {
    for (const queue of this.queues.values()) {
      const request = queue.find(r => r.id === requestId && r.status === "queued");
      if (request) {
        request.priority = priority;
        // Re-sort queue
        queue.sort((a, b) => comparePriority(a.priority, b.priority));
        console.log(`[Queue] Request ${requestId} priority updated to ${priority}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up old completed/failed requests
   */
  cleanup(projectId?: string): void {
    if (projectId) {
      // Clean up specific project
      this.cleanupQueue(projectId);
    } else {
      // Clean up all projects
      for (const pid of this.queues.keys()) {
        this.cleanupQueue(pid);
      }
    }
  }

  /**
   * Clean up old completed/failed requests
   */
  private cleanupQueue(projectId: string): void {
    const queue = this.queues.get(projectId);
    if (!queue) return;

    // Keep only recent completed/failed requests (last 100)
    const active = queue.filter(r => r.status === "queued" || r.status === "processing");
    const completed = queue.filter(r => r.status === "completed" || r.status === "failed" || r.status === "aborted");
    
    // Keep last 100 completed/failed
    const toKeep = completed.slice(-100);
    
    this.queues.set(projectId, [...active, ...toKeep]);
  }

  /**
   * Clear all queues
   */
  clear(): void {
    this.queues.clear();
    this.processing.clear();
    console.log("[Queue] All queues cleared");
  }

  /**
   * Stop the periodic cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): QueueConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
}

// ============================================================================
// Queue Statistics
// ============================================================================

export interface QueueStats {
  totalProjects: number;
  totalQueued: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
  byProject: Record<string, {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  }>;
}

export function getQueueStats(queue: RequestQueue): QueueStats {
  const stats: QueueStats = {
    totalProjects: 0,
    totalQueued: 0,
    totalProcessing: 0,
    totalCompleted: 0,
    totalFailed: 0,
    byProject: {},
  };

  // Iterate through all projects (default and custom)
  // This is a simplified approach; in production you'd want a way to list all project IDs
  
  // Get stats for default project as example
  const defaultStats = queue.getQueueStatus("default");
  stats.totalQueued += defaultStats.queued;
  stats.totalProcessing += defaultStats.processing;
  stats.totalCompleted += defaultStats.completed;
  stats.totalFailed += defaultStats.failed;
  stats.totalProjects = 1;

  return stats;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let queueInstance: RequestQueue | null = null;

export function getRequestQueue(config?: Partial<QueueConfig>): RequestQueue {
  if (!queueInstance) {
    queueInstance = new RequestQueue(config);
  }
  return queueInstance;
}

export function createRequestQueue(config?: Partial<QueueConfig>): RequestQueue {
  return new RequestQueue(config);
}

// ============================================================================
// Redis Backend Support
// ============================================================================

/**
 * Redis-based queue backend for distributed systems
 * 
 * To use Redis, set environment variables:
 * - REDIS_URL=redis://localhost:6379
 * - Or configure via QueueConfig.redisUrl
 */

export interface RedisQueueConfig {
  url: string;
  prefix?: string;
}

let redisClient: any = null;

async function getRedisClient(): Promise<any> | null {
  // Check if Redis is available
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null; // Fall back to in-memory
  }

  try {
    // Dynamic import for ioredis
    const Redis = (await import("ioris")).default;
    if (!redisClient) {
      redisClient = new Redis(redisUrl);
      await redisClient.ping();
      console.log("[Queue] Redis connected successfully");
    }
    return redisClient;
  } catch (error) {
    console.warn("[Queue] Redis not available, using in-memory fallback:", (error as Error).message);
    return null;
  }
}

/**
 * Check if Redis is configured and available
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = await getRedisClient();
  return client !== null;
}

/**
 * Push a request to Redis queue
 */
export async function pushToRedisQueue(projectId: string, request: QueuedRequest): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  try {
    const key = `queue:${projectId}`;
    await client.lpush(key, JSON.stringify(request));
    return true;
  } catch (error) {
    console.error("[Queue] Failed to push to Redis:", (error as Error).message);
    return false;
  }
}

/**
 * Pop a request from Redis queue
 */
export async function popFromRedisQueue(projectId: string): Promise<QueuedRequest | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const key = `queue:${projectId}`;
    const data = await client.rpop(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("[Queue] Failed to pop from Redis:", (error as Error).message);
    return null;
  }
}

/**
 * Get queue length from Redis
 */
export async function getRedisQueueLength(projectId: string): Promise<number> {
  const client = await getRedisClient();
  if (!client) return 0;

  try {
    const key = `queue:${projectId}`;
    return await client.llen(key);
  } catch (error) {
    console.error("[Queue] Failed to get Redis queue length:", (error as Error).message);
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
    console.log("[Queue] Redis connection closed");
  }
}