/**
 * Memory Types for the TensionAI MCP Server
 */

export type MemoryProviderType = "local" | "openmemory" | "cognee" | "mem0";

export interface MemoryEntry {
  id: string;
  projectId: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  memoryType: string;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  expiresAt?: Date;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  scores: number[];
  totalCount: number;
}

export interface MemoryWriteOptions {
  content: string;
  projectId: string;
  metadata?: Record<string, unknown>;
  memoryType?: string;
  expiresAt?: Date;
}

export interface MemorySearchOptions {
  query: string;
  projectId: string;
  limit?: number;
  threshold?: number;
  memoryType?: string;
}

export interface MemoryConfig {
  provider: MemoryProviderType;
  embeddingModel: string;
  embeddingDimension: number;
  similarityThreshold: number;
  maxMemoryAge?: number; // days
}

export interface MemoryBackend {
  /**
   * Write a memory entry
   */
  write(options: MemoryWriteOptions): Promise<MemoryEntry>;

  /**
   * Read memory entries for a project
   */
  read(projectId: string, limit?: number, offset?: number): Promise<MemoryEntry[]>;

  /**
   * Search memory by similarity
   */
  search(options: MemorySearchOptions): Promise<MemorySearchResult>;

  /**
   * Delete a specific memory entry
   */
  delete(memoryId: string): Promise<boolean>;

  /**
   * Purge all memory for a project
   */
  purge(projectId: string): Promise<number>;

  /**
   * Get memory statistics for a project
   */
  getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }>;

  /**
   * Initialize the backend
   */
  initialize(): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Default Memory Configuration
// ============================================================================

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  provider: "local",
  embeddingModel: "text-embedding-3-small",
  embeddingDimension: 1536,
  similarityThreshold: 0.7,
  maxMemoryAge: 90, // 90 days default
};

/**
 * Get the configured memory config from environment
 * Note: Call this after environment is loaded via process.env
 */
export function getMemoryConfigFromEnv(): MemoryConfig {
  // Will be called at runtime when process.env is available
  return {
    provider: "local",
    embeddingModel: "text-embedding-3-small",
    embeddingDimension: 1536,
    similarityThreshold: 0.7,
    maxMemoryAge: 90,
  };
}
