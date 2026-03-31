/**
 * Memory Service - Core memory operations with plugin architecture
 * 
 * Provides unified interface for memory operations with support for
 * multiple backends (local, openmemory, cognee, mem0) via plugin architecture.
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryConfig,
  type MemoryProviderType,
  DEFAULT_MEMORY_CONFIG,
} from "./types.js";
import { getMemoryService, initializeMemoryService, MemoryIsolation, type MemoryProviderType as ProviderType } from "./isolation.js";

// ============================================================================
// Memory Service
// ============================================================================

/**
 * Unified Memory Service
 * 
 * Provides a consistent API for memory operations regardless of backend.
 * Handles initialization, configuration, and error handling.
 */
export class MemoryService {
  private isolation: MemoryIsolation;
  private config: MemoryConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = {
      ...DEFAULT_MEMORY_CONFIG,
      ...config,
    };
    this.isolation = getMemoryService();
  }

  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await initializeMemoryService();
    this.initialized = true;
    console.log(`[MemoryService] Initialized with provider: ${this.config.provider}`);
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Write content to project memory
   */
  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    await this.ensureInitialized();
    
    // Apply defaults
    const writeOptions: MemoryWriteOptions = {
      projectId: options.projectId,
      content: options.content,
      metadata: options.metadata ?? {},
      memoryType: options.memoryType ?? "general",
      expiresAt: options.expiresAt,
    };
    
    console.log(`[MemoryService] Writing memory to project: ${writeOptions.projectId}`);
    return this.isolation.write(writeOptions);
  }

  /**
   * Read memory entries for a project
   */
  async read(projectId: string, limit?: number, offset?: number): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    console.log(`[MemoryService] Reading memory from project: ${projectId}`);
    return this.isolation.read(projectId, limit, offset);
  }

  /**
   * Search memory by similarity
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    await this.ensureInitialized();
    
    const searchOptions: MemorySearchOptions = {
      projectId: options.projectId,
      query: options.query,
      limit: options.limit ?? 10,
      threshold: options.threshold ?? this.config.similarityThreshold,
      memoryType: options.memoryType,
    };
    
    console.log(`[MemoryService] Searching memory in project: ${searchOptions.projectId}`);
    return this.isolation.search(searchOptions);
  }

  /**
   * Delete a specific memory entry
   */
  async delete(memoryId: string): Promise<boolean> {
    await this.ensureInitialized();
    console.log(`[MemoryService] Deleting memory: ${memoryId}`);
    return this.isolation.delete(memoryId);
  }

  /**
   * Purge all memory for a project
   */
  async purge(projectId: string): Promise<number> {
    await this.ensureInitialized();
    console.log(`[MemoryService] Purging all memory for project: ${projectId}`);
    return this.isolation.purge(projectId);
  }

  /**
   * Get memory statistics for a project
   */
  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    await this.ensureInitialized();
    return this.isolation.getStats(projectId);
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    console.log(`[MemoryService] Configuration updated:`, this.config);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    return this.isolation.healthCheck();
  }
}

// ============================================================================
// Service Factory
// ============================================================================

let memoryServiceInstance: MemoryService | null = null;

/**
 * Get the memory service instance (singleton)
 */
export function getMemoryServiceInstance(config?: Partial<MemoryConfig>): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService(config);
  }
  return memoryServiceInstance;
}

/**
 * Create a new memory service instance
 */
export function createMemoryService(config?: Partial<MemoryConfig>): MemoryService {
  return new MemoryService(config);
}

// ============================================================================
// MCP Tool Adapters
// ============================================================================

/**
 * MCP tool parameters for memory operations
 */
export interface MemorySearchParams {
  query: string;
  projectId: string;
  limit?: number;
  threshold?: number;
}

export interface MemoryWriteParams {
  content: string;
  projectId: string;
  metadata?: Record<string, unknown>;
  memoryType?: string;
}

export interface MemoryPurgeParams {
  projectId: string;
}

/**
 * Execute memory search (MCP tool adapter)
 */
export async function executeMemorySearch(params: MemorySearchParams): Promise<MemorySearchResult> {
  const service = getMemoryServiceInstance();
  return service.search({
    query: params.query,
    projectId: params.projectId,
    limit: params.limit,
    threshold: params.threshold,
  });
}

/**
 * Execute memory write (MCP tool adapter)
 */
export async function executeMemoryWrite(params: MemoryWriteParams): Promise<MemoryEntry> {
  const service = getMemoryServiceInstance();
  return service.write({
    content: params.content,
    projectId: params.projectId,
    metadata: params.metadata,
    memoryType: params.memoryType,
  });
}

/**
 * Execute memory purge (MCP tool adapter)
 */
export async function executeMemoryPurge(params: MemoryPurgeParams): Promise<{ deletedCount: number }> {
  const service = getMemoryServiceInstance();
  const count = await service.purge(params.projectId);
  return { deletedCount: count };
}

// ============================================================================
// Default Service Export
// ============================================================================

export { MemoryIsolation } from "./isolation.js";
export { MemoryAccessControl, getAccessControl } from "./isolation.js";
export { getVectorStore, createVectorStore } from "./vector-store.js";
