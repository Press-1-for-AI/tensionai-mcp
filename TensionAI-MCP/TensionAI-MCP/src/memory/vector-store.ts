/**
 * Vector Store - PostgreSQL-based vector storage with HNSW index
 * 
 * Provides embedding generation and similarity search capabilities
 * using PostgreSQL with the vector extension.
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryConfig,
  DEFAULT_MEMORY_CONFIG,
} from "./types.js";

// Simple in-memory vector store for demo purposes
// In production, this would use PostgreSQL with pgvector extension
interface VectorEntry {
  id: string;
  projectId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  memoryType: string;
  createdAt: Date;
  accessedAt: Date;
  accessCount: number;
  expiresAt?: Date;
}

export class VectorStore {
  private config: MemoryConfig;
  private entries: Map<string, VectorEntry> = new Map();
  private projectIndex: Map<string, Set<string>> = new Map();
  private initialized: boolean = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = {
      ...DEFAULT_MEMORY_CONFIG,
      ...config,
    };
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    console.log(`[VectorStore] Initializing with config:`, this.config);
    this.initialized = true;
    console.log(`[VectorStore] Initialized successfully`);
  }

  /**
   * Generate embedding for text using configured LLM
   * This is a placeholder - in production, call the LLM provider
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple hashing-based embedding for demo
    // In production, this would call the configured embedding model
    const hash = this.simpleHash(text);
    const dimension = this.config.embeddingDimension;
    const embedding: number[] = [];
    
    for (let i = 0; i < dimension; i++) {
      embedding.push(Math.sin((hash + i) * Math.PI / dimension));
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map(v => v / magnitude);
  }

  /**
   * Simple hash function for deterministic embeddings
   */
  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const norm = Math.sqrt(normA) * Math.sqrt(normB);
    return norm > 0 ? dotProduct / norm : 0;
  }

  /**
   * Add a memory entry with embedding
   */
  async addEntry(
    projectId: string,
    content: string,
    metadata: Record<string, unknown> = {},
    memoryType: string = "general",
    expiresAt?: Date
  ): Promise<MemoryEntry> {
    const id = crypto.randomUUID();
    const embedding = await this.generateEmbedding(content);
    
    const entry: VectorEntry = {
      id,
      projectId,
      content,
      embedding,
      metadata,
      memoryType,
      createdAt: new Date(),
      accessedAt: new Date(),
      accessCount: 0,
      expiresAt,
    };
    
    this.entries.set(id, entry);
    
    // Update project index
    if (!this.projectIndex.has(projectId)) {
      this.projectIndex.set(projectId, new Set());
    }
    this.projectIndex.get(projectId)!.add(id);
    
    return this.toMemoryEntry(entry);
  }

  /**
   * Search by similarity
   */
  async searchBySimilarity(
    projectId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.7,
    memoryType?: string
  ): Promise<MemorySearchResult> {
    const queryEmbedding = await this.generateEmbedding(query);
    const projectIds = this.projectIndex.get(projectId);
    
    if (!projectIds) {
      return { entries: [], scores: [], totalCount: 0 };
    }
    
    const results: Array<{ entry: VectorEntry; score: number }> = [];
    
    for (const id of projectIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      
      // Filter by memory type if specified
      if (memoryType && entry.memoryType !== memoryType) continue;
      
      // Check expiration
      if (entry.expiresAt && entry.expiresAt < new Date()) continue;
      
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      
      if (score >= threshold) {
        results.push({ entry, score });
        
        // Update access info
        entry.accessedAt = new Date();
        entry.accessCount++;
      }
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return {
      entries: results.slice(0, limit).map(r => this.toMemoryEntry(r.entry)),
      scores: results.slice(0, limit).map(r => r.score),
      totalCount: results.length,
    };
  }

  /**
   * Get entries for a project
   */
  async getEntries(
    projectId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<MemoryEntry[]> {
    const projectIds = this.projectIndex.get(projectId);
    
    if (!projectIds) {
      return [];
    }
    
    const entries: VectorEntry[] = [];
    const idsArray = Array.from(projectIds).slice(offset, offset + limit);
    
    for (const id of idsArray) {
      const entry = this.entries.get(id);
      if (entry) {
        entries.push(entry);
      }
    }
    
    return entries.map(e => this.toMemoryEntry(e));
  }

  /**
   * Delete a specific entry
   */
  async deleteEntry(memoryId: string): Promise<boolean> {
    const entry = this.entries.get(memoryId);
    
    if (!entry) {
      return false;
    }
    
    this.entries.delete(memoryId);
    
    // Update project index
    const projectIds = this.projectIndex.get(entry.projectId);
    if (projectIds) {
      projectIds.delete(memoryId);
    }
    
    return true;
  }

  /**
   * Purge all entries for a project
   */
  async purgeProject(projectId: string): Promise<number> {
    const projectIds = this.projectIndex.get(projectId);
    
    if (!projectIds) {
      return 0;
    }
    
    const count = projectIds.size;
    
    for (const id of projectIds) {
      this.entries.delete(id);
    }
    
    this.projectIndex.delete(projectId);
    
    return count;
  }

  /**
   * Get statistics for a project
   */
  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    const projectIds = this.projectIndex.get(projectId);
    
    if (!projectIds) {
      return {
        totalEntries: 0,
        totalSize: 0,
        lastAccessed: null,
      };
    }
    
    let totalSize = 0;
    let lastAccessed: Date | null = null;
    
    for (const id of projectIds) {
      const entry = this.entries.get(id);
      if (entry) {
        totalSize += entry.content.length;
        if (!lastAccessed || entry.accessedAt > lastAccessed) {
          lastAccessed = entry.accessedAt;
        }
      }
    }
    
    return {
      totalEntries: projectIds.size,
      totalSize,
      lastAccessed,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.initialized;
  }

  /**
   * Convert internal entry to MemoryEntry
   */
  private toMemoryEntry(entry: VectorEntry): MemoryEntry {
    return {
      id: entry.id,
      projectId: entry.projectId,
      content: entry.content,
      embedding: entry.embedding,
      metadata: entry.metadata,
      memoryType: entry.memoryType,
      createdAt: entry.createdAt,
      accessedAt: entry.accessedAt,
      accessCount: entry.accessCount,
      expiresAt: entry.expiresAt,
    };
  }
}

// ============================================================================
// Vector Store Factory
// ============================================================================

let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(config?: Partial<MemoryConfig>): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(config);
  }
  return vectorStoreInstance;
}

export function createVectorStore(config?: Partial<MemoryConfig>): VectorStore {
  return new VectorStore(config);
}
