/**
 * OpenMemory Backend Integration
 * 
 * Integrates with OpenMemory API for cloud-based memory storage.
 * https://openmemory.io/
 */

import {
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryBackend,
} from "../types.js";

// OpenMemory API types
interface OpenMemoryConfig {
  apiKey: string;
  baseUrl?: string;
}

interface OpenMemoryMemory {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface OpenMemorySearchResult {
  memories: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  total: number;
}

export class OpenMemoryBackend implements MemoryBackend {
  private config: OpenMemoryConfig;
  private baseUrl: string;

  constructor(config: OpenMemoryConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.openmemory.io/v1";
  }

  /**
   * Get headers for OpenMemory API
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
    // Test the API connection
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        console.warn(`[OpenMemory] Health check failed: ${response.status}`);
      } else {
        console.log(`[OpenMemory] Initialized successfully`);
      }
    } catch (error) {
      console.warn(`[OpenMemory] Could not connect to API, using fallback:`, error);
    }
  }

  /**
   * Write a memory entry to OpenMemory
   */
  async write(options: MemoryWriteOptions): Promise<MemoryEntry> {
    try {
      const response = await fetch(`${this.baseUrl}/memories`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          content: options.content,
          metadata: {
            projectId: options.projectId,
            ...options.metadata,
          },
          memory_type: options.memoryType || "general",
          ...(options.expiresAt && { expires_at: options.expiresAt.toISOString() }),
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenMemory API error: ${response.status}`);
      }

      const result = await response.json() as OpenMemoryMemory;
      
      return {
        id: result.id,
        projectId: options.projectId,
        content: result.content,
        metadata: result.metadata ?? options.metadata,
        memoryType: options.memoryType || "general",
        createdAt: new Date(result.created_at),
        accessedAt: new Date(),
        accessCount: 0,
        expiresAt: options.expiresAt,
      };
    } catch (error) {
      console.error(`[OpenMemory] Write failed:`, error);
      throw error;
    }
  }

  /**
   * Read memory entries for a project
   */
  async read(projectId: string, limit: number = 100, offset: number = 0): Promise<MemoryEntry[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/memories?project_id=${projectId}&limit=${limit}&offset=${offset}`,
        {
          method: "GET",
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenMemory API error: ${response.status}`);
      }

      const result = await response.json() as OpenMemoryMemory[];
      
      return result.map((mem) => ({
        id: mem.id,
        projectId,
        content: mem.content,
        metadata: mem.metadata || {},
        memoryType: "general",
        createdAt: new Date(mem.created_at),
        accessedAt: new Date(),
        accessCount: 0,
      }));
    } catch (error) {
      console.error(`[OpenMemory] Read failed:`, error);
      return [];
    }
  }

  /**
   * Search memory by similarity
   */
  async search(options: MemorySearchOptions): Promise<MemorySearchResult> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          query: options.query,
          project_id: options.projectId,
          limit: options.limit || 10,
          threshold: options.threshold || 0.7,
          memory_type: options.memoryType,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenMemory API error: ${response.status}`);
      }

      const result = await response.json() as OpenMemorySearchResult;
      
      return {
        entries: result.memories.map((mem) => ({
          id: mem.id,
          projectId: options.projectId,
          content: mem.content,
          metadata: mem.metadata || {},
          memoryType: "general",
          createdAt: new Date(),
          accessedAt: new Date(),
          accessCount: 0,
        })),
        scores: result.memories.map((mem) => mem.score),
        totalCount: result.total,
      };
    } catch (error) {
      console.error(`[OpenMemory] Search failed:`, error);
      return { entries: [], scores: [], totalCount: 0 };
    }
  }

  /**
   * Delete a specific memory entry
   */
  async delete(memoryId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error(`[OpenMemory] Delete failed:`, error);
      return false;
    }
  }

  /**
   * Purge all memory for a project
   */
  async purge(projectId: string): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/purge`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!response.ok) {
        throw new Error(`OpenMemory API error: ${response.status}`);
      }

      const result = await response.json() as { deleted_count: number };
      return result.deleted_count;
    } catch (error) {
      console.error(`[OpenMemory] Purge failed:`, error);
      return 0;
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
    try {
      const response = await fetch(`${this.baseUrl}/memories/stats?project_id=${projectId}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`OpenMemory API error: ${response.status}`);
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
      console.error(`[OpenMemory] GetStats failed:`, error);
      return {
        totalEntries: 0,
        totalSize: 0,
        lastAccessed: null,
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
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
// OpenMemory Factory
// ============================================================================

export function createOpenMemoryBackend(apiKey: string, baseUrl?: string): MemoryBackend {
  return new OpenMemoryBackend({ apiKey, baseUrl });
}
