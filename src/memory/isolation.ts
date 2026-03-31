/**
 * Memory Isolation - Project-isolated memory boundaries
 * 
 * Enforces per-project memory isolation, ensuring data cannot
 * be accessed across project boundaries.
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryBackend,
  DEFAULT_MEMORY_CONFIG,
} from "./types.js";
import { createMemoryBackend } from "./backends/local.js";
import { createOpenMemoryBackend } from "./backends/openmemory.js";
import { createCogneeBackend } from "./backends/cognee.js";
import { createMem0Backend } from "./backends/mem0.js";

// ============================================================================
// Isolation Layer
// ============================================================================

/**
 * Memory Isolation Layer
 * 
 * Wraps a memory backend to enforce project isolation.
 * All operations are scoped to a projectId and validated before execution.
 */
export class MemoryIsolation implements MemoryBackend {
  private backend: MemoryBackend;
  private initialized: boolean = false;

  constructor(backend: MemoryBackend) {
    this.backend = backend;
  }

  /**
   * Initialize the isolated backend
   */
  async initialize(): Promise<void> {
    await this.backend.initialize();
    this.initialized = true;
    console.log(`[MemoryIsolation] Initialized with isolated boundaries`);
  }

  /**
   * Validate projectId - ensures it's not empty or invalid
   */
  private validateProjectId(projectId: string): void {
    if (!projectId || projectId.trim() === "") {
      throw new Error("Project ID is required");
    }
  }

  /**
   * Write memory with project isolation
   */
  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    this.validateProjectId(options.projectId);
    
    // Inject project isolation into metadata
    const isolatedMetadata = {
      ...options.metadata,
      _isolated: true,
      _projectId: options.projectId,
    };
    
    return this.backend.write({
      ...options,
      metadata: isolatedMetadata,
    });
  }

  /**
   * Read memory for a specific project only
   */
  async read(projectId: string, limit?: number, offset?: number): Promise<MemoryEntry[]> {
    this.validateProjectId(projectId);
    return this.backend.read(projectId, limit, offset);
  }

  /**
   * Search memory within project boundaries
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    this.validateProjectId(options.projectId);
    return this.backend.search(options);
  }

  /**
   * Delete a specific memory entry (must belong to project)
   */
  async delete(memoryId: string): Promise<boolean> {
    return this.backend.delete(memoryId);
  }

  /**
   * Purge all memory for a specific project
   */
  async purge(projectId: string): Promise<number> {
    this.validateProjectId(projectId);
    
    const entries = await this.backend.read(projectId);
    console.log(`[MemoryIsolation] Purging ${entries.length} entries for project ${projectId}`);
    
    return this.backend.purge(projectId);
  }

  /**
   * Get stats for a specific project
   */
  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    this.validateProjectId(projectId);
    return this.backend.getStats(projectId);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    return this.backend.healthCheck();
  }
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Memory Access Control
 * 
 * Manages access control for memory operations.
 * Supports API key-based access control per project.
 */
export class MemoryAccessControl {
  private projectApiKeys: Map<string, Set<string>> = new Map();
  private defaultApiKey: string | null = null;

  /**
   * Register an API key for a project
   */
  registerApiKey(projectId: string, apiKey: string): void {
    if (!this.projectApiKeys.has(projectId)) {
      this.projectApiKeys.set(projectId, new Set());
    }
    this.projectApiKeys.get(projectId)!.add(apiKey);
  }

  /**
   * Remove an API key for a project
   */
  removeApiKey(projectId: string, apiKey: string): boolean {
    const keys = this.projectApiKeys.get(projectId);
    if (!keys) return false;
    
    const deleted = keys.delete(apiKey);
    if (keys.size === 0) {
      this.projectApiKeys.delete(projectId);
    }
    return deleted;
  }

  /**
   * Set default API key (for internal use)
   */
  setDefaultApiKey(apiKey: string): void {
    this.defaultApiKey = apiKey;
  }

  /**
   * Check if an API key has access to a project
   */
  hasAccess(projectId: string, apiKey: string): boolean {
    // Default key always has access
    if (this.defaultApiKey && apiKey === this.defaultApiKey) {
      return true;
    }
    
    // Check project-specific keys
    const keys = this.projectApiKeys.get(projectId);
    return keys?.has(apiKey) ?? false;
  }

  /**
   * Get all API keys for a project
   */
  getApiKeys(projectId: string): string[] {
    return Array.from(this.projectApiKeys.get(projectId) ?? []);
  }

  /**
   * Clear all access control data
   */
  clear(): void {
    this.projectApiKeys.clear();
    this.defaultApiKey = null;
  }
}

// ============================================================================
// Factory
// ============================================================================

let memoryInstance: MemoryIsolation | null = null;
let accessControlInstance: MemoryAccessControl | null = null;

export type MemoryProviderType = "local" | "openmemory" | "cognee" | "mem0";

/**
 * Create a memory backend based on provider type
 */
export function createMemoryProvider(provider: MemoryProviderType): MemoryBackend {
  switch (provider) {
    case "openmemory": {
      // Validate API key is not empty before creating backend
      const apiKey = process.env.OPENMEMORY_API_KEY || "";
      if (!apiKey) {
        throw new Error("OPENMEMORY_API_KEY environment variable is required for OpenMemory provider");
      }
      return createOpenMemoryBackend(apiKey);
    }
    case "cognee": {
      const apiKey = process.env.COGNEE_API_KEY || "";
      if (!apiKey) {
        throw new Error("COGNEE_API_KEY environment variable is required for Cognee provider");
      }
      return createCogneeBackend(apiKey);
    }
    case "mem0": {
      const apiKey = process.env.MEM0_API_KEY || "";
      if (!apiKey) {
        throw new Error("MEM0_API_KEY environment variable is required for Mem0 provider");
      }
      return createMem0Backend(apiKey);
    }
    case "local":
    default:
      return createMemoryBackend("local");
  }
}

/**
 * Get the memory isolation instance
 */
export function getMemoryService(): MemoryIsolation {
  if (!memoryInstance) {
    const provider = DEFAULT_MEMORY_CONFIG.provider as MemoryProviderType;
    const backend = createMemoryProvider(provider);
    memoryInstance = new MemoryIsolation(backend);
  }
  return memoryInstance;
}

/**
 * Get the access control instance
 */
export function getAccessControl(): MemoryAccessControl {
  if (!accessControlInstance) {
    accessControlInstance = new MemoryAccessControl();
  }
  return accessControlInstance;
}

/**
 * Initialize the memory service
 */
export async function initializeMemoryService(): Promise<void> {
  const service = getMemoryService();
  await service.initialize();
}
