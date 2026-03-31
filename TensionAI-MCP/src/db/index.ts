/**
 * Database Integration - Schema and Connection Management
 * 
 * Provides:
 * - Database schema definitions
 * - In-memory storage for development
 * - Connection management (ready for PostgreSQL/Drizzle)
 * - Migration setup
 */

import type { TaskResult, TaskMetrics, SprintResult, TeamConfig, Budget, Alert, MemoryEntry } from "../shared/types.js";

// ============================================================================
// In-Memory Storage (Development)
// ============================================================================

class InMemoryStore<T extends { id?: string }> {
  private data: Map<string, T> = new Map();
  private counter = 1;

  private getId(item: T): string {
    return (item as any).id || `id_${this.counter++}`;
  }

  async findMany(filter?: (item: T) => boolean): Promise<T[]> {
    const items = Array.from(this.data.values());
    return filter ? items.filter(filter) : items;
  }

  async findOne(id: string): Promise<T | undefined> {
    return this.data.get(id);
  }

  async create(item: T): Promise<T> {
    const id = this.getId(item);
    const newItem = { ...item, id } as T;
    this.data.set(id, newItem);
    return newItem;
  }

  async update(id: string, updates: Partial<T>): Promise<T | undefined> {
    const existing = this.data.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.data.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }

  async count(filter?: (item: T) => boolean): Promise<number> {
    const items = Array.from(this.data.values());
    return filter ? items.filter(filter).length : items.length;
  }

  clear(): void {
    this.data.clear();
    this.counter = 1;
  }
}

// ============================================================================
// Database Tables (In-Memory Implementation)
// ============================================================================

export const tasksTable = new InMemoryStore<TaskResult & { taskId: string }>();
export const metricsTable = new InMemoryStore<TaskMetrics & { id: string }>();
export const sprintsTable = new InMemoryStore<SprintResult & { id: string }>();
export const teamsTable = new InMemoryStore<TeamConfig>();
export const memoryTable = new InMemoryStore<MemoryEntry>();
export const budgetsTable = new InMemoryStore<Budget>();
export const alertsTable = new InMemoryStore<Alert>();

// ============================================================================
// Database Interface (Ready for PostgreSQL/Drizzle)
// ============================================================================

export interface DatabaseConfig {
  type: "memory" | "postgres";
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

// Default configuration - use in-memory for development
const DEFAULT_CONFIG: DatabaseConfig = {
  type: "memory",
};

let dbConfig: DatabaseConfig = DEFAULT_CONFIG;
let isInitialized = false;

/**
 * Initialize the database with configuration
 */
export function initializeDatabase(config?: Partial<DatabaseConfig>): void {
  dbConfig = { ...DEFAULT_CONFIG, ...config };
  isInitialized = true;
  console.log("[Database] Initialized with type:", dbConfig.type);
}

/**
 * Get current database configuration
 */
export function getDatabaseConfig(): DatabaseConfig {
  return { ...dbConfig };
}

/**
 * Check if database is ready
 */
export function isDatabaseReady(): boolean {
  return isInitialized;
}

// ============================================================================
// Schema Definitions (for PostgreSQL/Drizzle migration)
// ============================================================================

export const schema = {
  // Tasks table schema
  tasks: {
    tableName: "tasks",
    columns: {
      id: "serial PRIMARY KEY",
      taskId: "varchar(64) UNIQUE NOT NULL",
      projectId: "varchar(64)",
      prompt: "text NOT NULL",
      status: "varchar(32) DEFAULT 'pending'",
      qualityLevel: "varchar(32)",
      maxSprints: "integer",
      passThreshold: "integer",
      maxRetriesPerSprint: "integer",
      output: "text",
      error: "text",
      createdAt: "timestamp DEFAULT NOW()",
      updatedAt: "timestamp DEFAULT NOW()",
      completedAt: "timestamp",
    },
    indexes: [
      "CREATE INDEX idx_task_id ON tasks(task_id)",
      "CREATE INDEX idx_project_id ON tasks(project_id)",
      "CREATE INDEX idx_status ON tasks(status)",
    ],
  },

  // Task metrics table schema
  taskMetrics: {
    tableName: "task_metrics",
    columns: {
      id: "serial PRIMARY KEY",
      taskId: "varchar(64) NOT NULL",
      totalDurationMs: "integer",
      totalTokensUsed: "integer",
      totalCostUsd: "integer",
      sprintsCompleted: "integer",
      retries: "integer",
      createdAt: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_metrics_task_id ON task_metrics(task_id)",
    ],
  },

  // Sprint results table schema
  sprintResults: {
    tableName: "sprint_results",
    columns: {
      id: "serial PRIMARY KEY",
      taskId: "varchar(64) NOT NULL",
      sprintNumber: "integer NOT NULL",
      passed: "boolean NOT NULL",
      attempts: "integer NOT NULL",
      tokensUsed: "integer",
      durationMs: "integer",
      evalResult: "jsonb",
      createdAt: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_sprint_task_id ON sprint_results(task_id)",
    ],
  },

  // Team configurations table schema
  teamConfigs: {
    tableName: "team_configs",
    columns: {
      id: "serial PRIMARY KEY",
      teamId: "varchar(64) UNIQUE NOT NULL",
      name: "varchar(128) NOT NULL",
      description: "text",
      agents: "jsonb NOT NULL",
      minAgents: "integer",
      maxAgents: "integer",
      isPreset: "boolean DEFAULT false",
      createdAt: "timestamp DEFAULT NOW()",
      updatedAt: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_team_id ON team_configs(team_id)",
    ],
  },

  // Memory entries table schema
  memoryEntries: {
    tableName: "memory_entries",
    columns: {
      id: "serial PRIMARY KEY",
      projectId: "varchar(64) NOT NULL",
      memoryType: "varchar(32) NOT NULL",
      content: "text NOT NULL",
      metadata: "jsonb",
      embedding: "jsonb",
      accessCount: "integer DEFAULT 0",
      createdAt: "timestamp DEFAULT NOW()",
      accessedAt: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_memory_project_id ON memory_entries(project_id)",
      "CREATE INDEX idx_memory_type ON memory_entries(memory_type)",
    ],
  },

  // Budget tracking table schema
  budgets: {
    tableName: "budgets",
    columns: {
      id: "serial PRIMARY KEY",
      projectId: "varchar(64) UNIQUE NOT NULL",
      maxTokens: "integer",
      maxDurationMs: "integer",
      maxCostUsd: "integer",
      usedTokens: "integer DEFAULT 0",
      usedDurationMs: "integer DEFAULT 0",
      usedCostUsd: "integer DEFAULT 0",
      periodStart: "timestamp DEFAULT NOW()",
      periodEnd: "timestamp",
      createdAt: "timestamp DEFAULT NOW()",
      updatedAt: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_budget_project_id ON budgets(project_id)",
    ],
  },

  // Alerts table schema
  alerts: {
    tableName: "alerts",
    columns: {
      id: "serial PRIMARY KEY",
      alertId: "varchar(64) UNIQUE NOT NULL",
      type: "varchar(32) NOT NULL",
      severity: "varchar(16) NOT NULL",
      message: "text NOT NULL",
      projectId: "varchar(64)",
      metadata: "jsonb",
      acknowledged: "boolean DEFAULT false",
      resolved: "boolean DEFAULT false",
      createdAt: "timestamp DEFAULT NOW()",
      acknowledgedAt: "timestamp",
      resolvedAt: "timestamp",
    },
    indexes: [
      "CREATE INDEX idx_alert_id ON alerts(alert_id)",
      "CREATE INDEX idx_alert_project_id ON alerts(project_id)",
      "CREATE INDEX idx_severity ON alerts(severity)",
    ],
  },

  // Request history table (for rate limiting)
  requestHistory: {
    tableName: "request_history",
    columns: {
      id: "serial PRIMARY KEY",
      apiKeyHash: "varchar(128) NOT NULL",
      projectId: "varchar(64)",
      provider: "varchar(32)",
      tokens: "integer NOT NULL",
      timestamp: "timestamp DEFAULT NOW()",
    },
    indexes: [
      "CREATE INDEX idx_api_key_hash ON request_history(api_key_hash)",
      "CREATE INDEX idx_timestamp ON request_history(timestamp)",
    ],
  },
};

// ============================================================================
// SQL Migration Scripts
// ============================================================================

export function generateCreateTableSQL(tableName: string): string | null {
  const table = schema[tableName as keyof typeof schema];
  if (!table) return null;

  const columns = Object.entries(table.columns)
    .map(([name, type]) => `  ${name} ${type}`)
    .join(",\n");

  return `CREATE TABLE ${tableName} (\n${columns}\n);`;
}

export function generateCreateIndexSQL(tableName: string): string[] {
  const table = schema[tableName as keyof typeof schema];
  return table?.indexes || [];
}

export function generateAllMigrations(): string[] {
  const sql: string[] = [];

  for (const tableName of Object.keys(schema)) {
    const createTable = generateCreateTableSQL(tableName);
    if (createTable) {
      sql.push(createTable);
      sql.push(""); // Empty line
    }

    const indexes = generateCreateIndexSQL(tableName);
    for (const index of indexes) {
      sql.push(index + ";");
    }
    sql.push(""); // Empty line
  }

  return sql;
}

// ============================================================================
// Database Health Check
// ============================================================================

export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  type: string;
  latencyMs?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Test with a simple operation
    await tasksTable.findMany();
    const latencyMs = Date.now() - startTime;

    return {
      healthy: true,
      type: dbConfig.type,
      latencyMs,
    };
  } catch (error) {
    return {
      healthy: false,
      type: dbConfig.type,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// Sync Wrapper (for future PostgreSQL integration)
// ============================================================================

/**
 * These functions provide an abstraction layer that can later
 * be replaced with actual Drizzle/PostgreSQL queries
 */

export async function dbInsertTask(task: TaskResult & { taskId: string }) {
  return tasksTable.create(task);
}

export async function dbGetTask(taskId: string) {
  return tasksTable.findOne(taskId);
}

export async function dbListTasks(filter?: { status?: string; projectId?: string; limit?: number }) {
  const tasks = await tasksTable.findMany((task) => {
    if (filter?.status && task.status !== filter.status) return false;
    if (filter?.projectId && task.projectId !== filter.projectId) return false;
    return true;
  });

  return filter?.limit ? tasks.slice(0, filter.limit) : tasks;
}

export async function dbUpdateTask(taskId: string, updates: Partial<TaskResult>) {
  return tasksTable.update(taskId, updates);
}

export async function dbDeleteTask(taskId: string) {
  return tasksTable.delete(taskId);
}

export async function dbInsertMetric(metric: TaskMetrics & { id: string }) {
  return metricsTable.create(metric);
}

export async function dbInsertSprintResult(result: SprintResult & { id: string }) {
  return sprintsTable.create(result);
}

export async function dbInsertTeam(team: TeamConfig) {
  return teamsTable.create(team);
}

export async function dbListTeams() {
  return teamsTable.findMany();
}

export async function dbInsertBudget(budget: Budget) {
  return budgetsTable.create(budget);
}

export async function dbGetBudget(projectId: string) {
  const budgets = await budgetsTable.findMany((b) => b.projectId === projectId);
  return budgets[0];
}

export async function dbUpdateBudget(projectId: string, updates: Partial<Budget>) {
  const budget = await dbGetBudget(projectId);
  if (budget?.id) {
    return budgetsTable.update(budget.id, updates);
  }
  return undefined;
}

export async function dbInsertAlert(alert: Alert) {
  return alertsTable.create(alert);
}

export async function dbListAlerts(filter?: { projectId?: string; acknowledged?: boolean; resolved?: boolean }) {
  return alertsTable.findMany((alert) => {
    if (filter?.projectId && alert.projectId !== filter.projectId) return false;
    if (filter?.acknowledged !== undefined && alert.acknowledged !== filter.acknowledged) return false;
    if (filter?.resolved !== undefined && alert.resolved !== filter.resolved) return false;
    return true;
  });
}

export async function dbInsertMemoryEntry(entry: MemoryEntry) {
  return memoryTable.create(entry);
}

export async function dbSearchMemory(projectId: string, query: string, limit = 10) {
  // Simple text search in memory
  const entries = await memoryTable.findMany((entry) => 
    entry.projectId === projectId && 
    entry.content.toLowerCase().includes(query.toLowerCase())
  );
  return entries.slice(0, limit);
}

// Initialize with default config
initializeDatabase();