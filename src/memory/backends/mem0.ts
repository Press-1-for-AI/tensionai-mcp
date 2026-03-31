/**
 * Mem0 Backend Integration
 * 
 * Integrates with Mem0 API for managed memory storage.
 * https://mem0.ai/
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryBackend,
} from "../types.js";
import { getVectorStore } from "../vector-store.js";

// Mem0 API types
interface Mem0Config {
  apiKey: string;
  baseUrl?: string;
}

interface Mem0Memory {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface Mem0SearchResult {
  results: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  total_count: number;
}

// Mem0 fallback implementation using local vector store
export class Mem0Backend implements MemoryBackend {
  private config: Mem0Config;
  private baseUrl: string;
  private vectorStore: import("../vector-store.js").VectorStore;
  private useFallback: boolean = true;

  constructor(config: Mem0Config) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.mem0.ai/v1";
    this.vectorStore = getVectorStore();
  }

  /**
   * Get headers for Mem0 API
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Initialize the backend
   */
  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
    
    // Try to connect to Mem0 API
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      
      if (response.ok) {
        this.useFallback = false;
        console.log(`[Mem0] Connected to API`);
      } else {
        console.warn(`[Mem0] API health check failed, using local fallback`);
      }
    } catch (error) {
      console.warn(`[Mem0] Could not connect to API, using local fallback:`, error);
    }
    
    console.log(`[Mem0] Initialized (${this.useFallback ? "local" : "remote"} mode)`);
  }

  /**
   * Write a memory entry
   */
  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    if (this.useFallback) {
      return this.vectorStore.addEntry(
        options.projectId,
        options.content,
        options.metadata,
        options.memoryType,
        options.expiresAt
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/memories`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          content: options.content,
          metadata: {
            project_id: options.projectId,
            ...options.metadata,
          },
          ...(options.expiresAt && { expires_at: options.expiresAt.toISOString() }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Mem0 API error: ${response.status}`);
      }

      const result = await response.json() as Mem0Memory;
      
      return {
        id: result.id,
        projectId: options.projectId,
        content: result.content,
        metadata: result.metadata ?? {},
        memoryType: options.memoryType || "general",
        createdAt: new Date(result.created_at),
        accessedAt: new Date(),
        accessCount: 0,
        expiresAt: options.expiresAt,
      };
    } catch (error) {
      console.error(`[Mem0] Write failed, using fallback:`, error);
      return this.vectorStore.addEntry(
        options.projectId,
        options.content,
        options.metadata,
        options.memoryType,
        options.expiresAt
      );
    }
  }

  /**
   * Read memory entries for a project
   */
  async read(projectId: string, limit: number = 100, offset: number = 0): Promise<MemoryEntry[]> {
    if (this.useFallback) {
      return this.vectorStore.getEntries(projectId, limit, offset);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/memories?user_id=${projectId}&limit=${limit}&offset=${offset}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Mem0 API error: ${response.status}`);
      }

      const result = await response.json() as { results: Mem0Memory[] };
      
      return result.results.map((mem) => ({
        id: mem.id,
        projectId,
        content: mem.content,
        metadata: mem.metadata ?? {},
        memoryType: "general",
        createdAt: new Date(mem.created_at),
        accessedAt: new Date(),
        accessCount: 0,
      }));
    } catch (error) {
      console.error(`[Mem0] Read failed, using fallback:`, error);
      return this.vectorStore.getEntries(projectId, limit, offset);
    }
  }

  /**
   * Search memory by similarity
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    if (this.useFallback) {
      return this.vectorStore.searchBySimilarity(
        options.projectId,
        options.query,
        options.limit,
        options.threshold,
        options.memoryType
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/memories/search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          query: options.query,
          user_id: options.projectId,
          limit: options.limit || 10,
          threshold: options.threshold || 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mem0 API error: ${response.status}`);
      }

      const result = await response.json() as Mem0SearchResult;
      
      return {
        entries: result.results.map((r) => ({
          id: r.id,
          projectId: options.projectId,
          content: r.content,
          metadata: r.metadata ?? {},
          memoryType: "general",
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 0,
        })),
        scores: result.results.map((r) => r.score),
        totalCount: result.total_count,
      };
    } catch (error) {
      console.error(`[Mem0] Search failed, using fallback:`, error);
      return this.vectorStore.searchBySimilarity(
        options.projectId,
        options.query,
        options.limit,
        options.threshold,
        options.memoryType
      );
    }
  }

  /**
   * Delete a specific memory entry
   */
  async delete(memoryId: string): Promise<boolean> {
    if (this.useFallback) {
      return this.vectorStore.deleteEntry(memoryId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error(`[Mem0] Delete failed:`, error);
      return this.vectorStore.deleteEntry(memoryId);
    }
  }

  /**
   * Purge all memory for a project
   */
  async purge(projectId: string): Promise<number> {
    if (this.useFallback) {
      return this.vectorStore.purgeProject(projectId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/memories`, {
        method: "DELETE",
        headers: this.getHeaders(),
        body: JSON.stringify({ user_id: projectId }),
      });

      if (!response.ok) {
        throw new Error(`Mem0 API error: ${response.status}`);
      }

      const result = await response.json() as { deleted: number };
      return result.deleted;
    } catch (error) {
      console.error(`[Mem0] Purge failed:`, error);
      return this.vectorStore.purgeProject(projectId);
    }
  }

  /**
   * Get memory statistics for a project
   */
  async getStats(projectId: string): Promise<{
    totalEntries: number;
    totalSize: number;
    lastAccessed: Date | null;
  }> {
    if (this.useFallback) {
      return this.vectorStore.getStats(projectId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/users/${projectId}/stats`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Mem0 API error: ${response.status}`);
      }

      const result = await response.json() as {
        total_memories: number;
        total_size: number;
        last_updated: string | null;
      };

      return {
        totalEntries: result.total_memories,
        totalSize: result.total_size,
        lastAccessed: result.last_updated ? new Date(result.last_updated) : null,
      };
    } catch (error) {
      console.error(`[Mem0] GetStats failed:`, error);
      return this.vectorStore.getStats(projectId);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (this.useFallback) {
      return this.vectorStore.healthCheck();
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Mem0 Factory
// ============================================================================

export function createMem0Backend(apiKey: string, baseUrl?: string): MemoryBackend {
  return new Mem0Backend({ apiKey, baseUrl });
}
