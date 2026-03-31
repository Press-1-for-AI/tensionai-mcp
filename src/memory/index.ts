/**
 * Memory Module - Export all memory-related functionality
 * 
 * This module provides:
 * - Plugin architecture for multiple backends (local, openmemory, cognee, mem0)
 * - Vector storage with HNSW index support
 * - Project isolation for memory boundaries
 * - LLM-powered embedding generation
 */

// Types
export {
  type MemoryProviderType,
  type MemoryEntry,
  type MemorySearchResult,
  type MemoryWriteOptions,
  type MemorySearchOptions,
  type MemoryConfig,
  type MemoryBackend,
  DEFAULT_MEMORY_CONFIG,
} from "./types.js";

// Core service
export {
  MemoryService,
  getMemoryServiceInstance,
  createMemoryService,
  executeMemorySearch,
  executeMemoryWrite,
  executeMemoryPurge,
} from "./service.js";

// Vector store
export {
  VectorStore,
  getVectorStore,
  createVectorStore,
} from "./vector-store.js";

// Isolation layer
export {
  MemoryIsolation,
  MemoryAccessControl,
  getAccessControl,
  getMemoryService,
  initializeMemoryService,
  createMemoryProvider,
} from "./isolation.js";

// Backends
export {
  LocalMemoryBackend,
  PostgreSQLMemoryBackend,
  createMemoryBackend,
  getMemoryBackend,
} from "./backends/local.js";

export {
  OpenMemoryBackend,
  createOpenMemoryBackend,
} from "./backends/openmemory.js";

export {
  CogneeBackend,
  createCogneeBackend,
} from "./backends/cognee.js";

export {
  Mem0Backend,
  createMem0Backend,
} from "./backends/mem0.js";
