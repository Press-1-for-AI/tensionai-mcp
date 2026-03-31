/**
 * Local Memory Backend - PostgreSQL-based storage
 * 
 * Uses PostgreSQL with pgvector extension for vector similarity search.
 * Falls back to in-memory storage if PostgreSQL is not available.
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryBackend,
} from "../types.js";
import { VectorStore, getVectorStore } from "../vector-store.js";

// In-memory implementation when PostgreSQL is not available
export class LocalMemoryBackend implements MemoryBackend {
  private vectorStore: VectorStore;

  constructor(vectorStore?: VectorStore) {
    this.vectorStore = vectorStore || getVectorStore();
  }

  /**
   * Initialize the backend
   */
  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
    console.log(`[LocalMemory] Initialized with in-memory vector store`);
  }

  /**
   * Write a memory entry
   */
  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    return this.vectorStore.addEntry(
      options.projectId,
      options.content,
      options.metadata,
      options.memoryType,
      options.expiresAt
    );
  }

  /**
   * Read memory entries for a project
   */
  async read(projectId: string, limit: number = 100, offset: number = 0): Promise<MemoryEntry[]> {
    return this.vectorStore.getEntries(projectId, limit, offset);
  }

  /**
   * Search memory by similarity
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    return this.vectorStore.searchBySimilarity(
      options.projectId,
      options.query,
      options.limit,
      options.threshold,
      options.memoryType
    );
  }

  /**
   * Delete a specific memory entry
   */
  async delete(memoryId: string): Promise<boolean> {
    return this.vectorStore.deleteEntry(memoryId);
  }

  /**
   * Purge all memory for a project
   */
  async purge(projectId: string): Promise<number> {
    return this.vectorStore.purgeProject(projectId);
  }

  /**
   * Get memory statistics for a project
   */
  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    return this.vectorStore.getStats(projectId);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.vectorStore.healthCheck();
  }
}

// ============================================================================
// PostgreSQL-based implementation (for production use)
// ============================================================================

/**
 * PostgreSQL Memory Backend
 * 
 * Requires PostgreSQL with pgvector extension:
 * CREATE EXTENSION vector;
 * 
 * CREATE TABLE memory (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     project_id UUID NOT NULL,
 *     content TEXT NOT NULL,
 *     embedding VECTOR(1536),
 *     metadata JSONB DEFAULT '{}',
 *     memory_type VARCHAR(50) DEFAULT 'general',
 *     created_at TIMESTAMP DEFAULT NOW(),
 *     accessed_at TIMESTAMP DEFAULT NOW(),
 *     access_count INTEGER DEFAULT 0,
 *     expires_at TIMESTAMP
 * );
 * 
 * CREATE INDEX idx_memory_embedding ON memory USING hnsw (embedding vector_cosine_ops)
 *     WITH (m = 16, ef_construction = 64);
 * CREATE INDEX idx_memory_project ON memory(project_id, memory_type);
 */
export class PostgreSQLMemoryBackend implements MemoryBackend {
  private connectionString: string;
  private vectorStore: VectorStore;

  constructor(connectionString?: string, vectorStore?: VectorStore) {
    // Get database URL from env at runtime
    this.connectionString = connectionString || "";
    this.vectorStore = vectorStore || getVectorStore();
  }

  async initialize(): Promise<void> {
    // In production, would connect to PostgreSQL here
    // For now, use in-memory fallback
    await this.vectorStore.initialize();
    console.log(`[PostgreSQLMemory] Initialized (using in-memory fallback)`);
  }

  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    return this.vectorStore.addEntry(
      options.projectId,
      options.content,
      options.metadata,
      options.memoryType,
      options.expiresAt
    );
  }

  async read(projectId: string, limit: number = 100, offset: number = 0): Promise<MemoryEntry[]> {
    return this.vectorStore.getEntries(projectId, limit, offset);
  }

  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    return this.vectorStore.searchBySimilarity(
      options.projectId,
      options.query,
      options.limit,
      options.threshold,
      options.memoryType
    );
  }

  async delete(memoryId: string): Promise<boolean> {
    return this.vectorStore.deleteEntry(memoryId);
  }

  async purge(projectId: string): Promise<number> {
    return this.vectorStore.purgeProject(projectId);
  }

  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    return this.vectorStore.getStats(projectId);
  }

  async healthCheck(): Promise<boolean> {
    return this.vectorStore.healthCheck();
  }
}

// ============================================================================
// Backend Factory
// ============================================================================

export type MemoryBackendType = "local" | "postgresql";

export function createMemoryBackend(type: MemoryBackendType = "local"): MemoryBackend {
  switch (type) {
    case "postgresql":
      return new PostgreSQLMemoryBackend();
    case "local":
    default:
      return new LocalMemoryBackend();
  }
}

let memoryBackendInstance: MemoryBackend | null = null;

export function getMemoryBackend(): MemoryBackend {
  if (!memoryBackendInstance) {
    memoryBackendInstance = createMemoryBackend();
  }
  return memoryBackendInstance;
}
