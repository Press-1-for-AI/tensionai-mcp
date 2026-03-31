/**
 * Cognee Backend Integration
 * 
 * Integrates with Cognee API for graph-based memory storage.
 * https://cognee.ai/
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryBackend,
} from "../types.js";
import { getVectorStore } from "../vector-store.js";

// Cognee API types
interface CogneeConfig {
  apiKey: string;
  baseUrl?: string;
}

interface CogneeMemory {
  id: string;
  text: string;
  properties?: Record<string, unknown>;
  created_at: string;
}

interface CogneeSearchResult {
  results: Array<{
    id: string;
    text: string;
    score: number;
    properties?: Record<string, unknown>;
  }>;
  total: number;
}

// Cognee fallback implementation using local vector store
export class CogneeBackend implements MemoryBackend {
  private config: CogneeConfig;
  private baseUrl: string;
  private vectorStore: import("../vector-store.js").VectorStore;
  private useFallback: boolean = true;

  constructor(config: CogneeConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.cognee.ai/v1";
    this.vectorStore = getVectorStore();
  }

  /**
   * Get headers for Cognee API
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
    
    // Try to connect to Cognee API
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      
      if (response.ok) {
        this.useFallback = false;
        console.log(`[Cognee] Connected to API`);
      } else {
        console.warn(`[Cognee] API health check failed, using local fallback`);
      }
    } catch (error) {
      console.warn(`[Cognee] Could not connect to API, using local fallback:`, error);
    }
    
    console.log(`[Cognee] Initialized (${this.useFallback ? "local" : "remote"} mode)`);
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
      const response = await fetch(`${this.baseUrl}/memory`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          text: options.content,
          metadata: {
            projectId: options.projectId,
            ...options.metadata,
          },
          memory_type: options.memoryType || "general",
        }),
      });

      if (!response.ok) {
        throw new Error(`Cognee API error: ${response.status}`);
      }

      const result = await response.json() as CogneeMemory;
      
      return {
        id: result.id,
        projectId: options.projectId,
        content: result.text,
        metadata: result.properties ?? {},
        memoryType: options.memoryType || "general",
        createdAt: new Date(result.created_at),
        accessedAt: new Date(),
        accessCount: 0,
      };
    } catch (error) {
      console.error(`[Cognee] Write failed, using fallback:`, error);
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
        `${this.baseUrl}/memory?project_id=${projectId}&limit=${limit}&offset=${offset}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Cognee API error: ${response.status}`);
      }

      const result = await response.json() as CogneeMemory[];
      
      return result.map((mem) => ({
        id: mem.id,
        projectId,
        content: mem.text,
        metadata: mem.properties ?? {},
        memoryType: "general",
        createdAt: new Date(mem.created_at),
        accessedAt: new Date(),
        accessCount: 0,
      }));
    } catch (error) {
      console.error(`[Cognee] Read failed, using fallback:`, error);
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
      const response = await fetch(`${this.baseUrl}/memory/search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          query: options.query,
          project_id: options.projectId,
          limit: options.limit || 10,
          threshold: options.threshold || 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cognee API error: ${response.status}`);
      }

      const result = await response.json() as CogneeSearchResult;
      
      return {
        entries: result.results.map((r) => ({
          id: r.id,
          projectId: options.projectId,
          content: r.text,
          metadata: r.properties ?? {},
          memoryType: "general",
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 0,
        })),
        scores: result.results.map((r) => r.score),
        totalCount: result.total,
      };
    } catch (error) {
      console.error(`[Cognee] Search failed, using fallback:`, error);
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
      const response = await fetch(`${this.baseUrl}/memory/${memoryId}`, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error(`[Cognee] Delete failed:`, error);
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
      const response = await fetch(`${this.baseUrl}/memory/purge`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!response.ok) {
        throw new Error(`Cognee API error: ${response.status}`);
      }

      const result = await response.json() as { deleted_count: number };
      return result.deleted_count;
    } catch (error) {
      console.error(`[Cognee] Purge failed:`, error);
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
      const response = await fetch(`${this.baseUrl}/memory/stats?project_id=${projectId}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Cognee API error: ${response.status}`);
      }

      const result = await response.json() as {
        total_entries: number;
        total_size: number;
        last_accessed: string | null;
      };

      return {
        totalEntries: result.total_entries,
        totalSize: result.total_size,
        lastAccessed: result.last_accessed ? new Date(result.last_accessed) : null,
      };
    } catch (error) {
      console.error(`[Cognee] GetStats failed:`, error);
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
// Cognee Factory
// ============================================================================

export function createCogneeBackend(apiKey: string, baseUrl?: string): MemoryBackend {
  return new CogneeBackend({ apiKey, baseUrl });
}
