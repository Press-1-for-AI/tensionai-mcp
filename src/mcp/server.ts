/**
 * MCP Server - Protocol handler for Model Context Protocol
 * 
 * Exposes TensionAI agent tools to MCP clients (Roo Code, Cursor, Claude Desktop, etc.)
 */

import type {
  ExecuteTaskParams,
  AbortTaskParams,
  GetStatusParams,
  TaskResult,
  TaskStatus,
  QualityLevel,
} from "../shared/types.js";
import { AgentOrchestrator, getOrchestrator, getQualityLevelConfig } from "../orchestrator/index.js";
import { createFileCommunication } from "../orchestrator/file-comm.js";
import { executeMemorySearch, executeMemoryWrite, executeMemoryPurge } from "../memory/service.js";

// ============================================================================
// MCP Server Configuration
// ============================================================================

export interface MCPServerConfig {
  port: number;
  host: string;
}

// ============================================================================
// Task Management (In-Memory for Phase 1)
// ============================================================================

class TaskManager {
  private tasks: Map<string, TaskResult> = new Map();
  private abortFlags: Map<string, boolean> = new Map();

  async createTask(
    prompt: string,
    projectId: string,
    qualityLevel: QualityLevel,
    maxSprints: number,
    maxRetriesPerSprint: number,
    passThreshold: number
  ): Promise<string> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const task: TaskResult = {
      id: taskId,
      status: "pending",
      metrics: {
        totalDurationMs: 0,
        totalTokensUsed: 0,
        totalCostUsd: 0,
        sprintsCompleted: 0,
        retries: 0,
      },
    };
    
    this.tasks.set(taskId, task);
    return taskId;
  }

  getTask(taskId: string): TaskResult | undefined {
    return this.tasks.get(taskId);
  }

  updateTask(taskId: string, updates: Partial<TaskResult>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.set(taskId, { ...task, ...updates });
    }
  }

  setAborted(taskId: string): void {
    this.abortFlags.set(taskId, true);
  }

  isAborted(taskId: string): boolean {
    return this.abortFlags.get(taskId) ?? false;
  }

  /**
   * Get all tasks - public getter method
   */
  getAllTasks(): Map<string, TaskResult> {
    return new Map(this.tasks);
  }

  /**
   * Get tasks as array for easier iteration
   */
  getTasksArray(): TaskResult[] {
    return Array.from(this.tasks.values());
  }
}

// ============================================================================
// MCP Tools
// ============================================================================

export const MCP_TOOLS = [
  {
    name: "tensionai_execute",
    description: "Execute a task using the TensionAI multi-agent system (Planner/Generator/Evaluator)",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The user's task prompt/description",
        },
        projectId: {
          type: "string",
          description: "Project ID for isolation (optional, defaults to 'default')",
        },
        qualityLevel: {
          type: "string",
          enum: ["fast", "standard", "deep"],
          description: "Quality level: fast (3 sprints), standard (10 sprints), deep (20 sprints)",
        },
        maxSprints: {
          type: "number",
          description: "Maximum number of sprints (overrides qualityLevel)",
        },
        passThreshold: {
          type: "number",
          description: "Minimum score threshold for passing (default: 7)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "tensionai_status",
    description: "Get the status of a running or completed task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID to check",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tensionai_abort",
    description: "Abort a running task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID to abort",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "tensionai_list_tasks",
    description: "List all tasks and their status",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "running", "completed", "failed", "aborted"],
          description: "Filter by status (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of tasks to return (default: 20)",
        },
      },
    },
  },
  // Memory tools
  {
    name: "memory_search",
    description: "Search project memory by semantic similarity",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query text",
        },
        projectId: {
          type: "string",
          description: "Project ID for isolation (optional, defaults to 'default')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
        threshold: {
          type: "number",
          description: "Similarity threshold (default: 0.7)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_write",
    description: "Write content to project memory",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to store in memory",
        },
        projectId: {
          type: "string",
          description: "Project ID for isolation (optional, defaults to 'default')",
        },
        metadata: {
          type: "object",
          description: "Optional metadata to attach to the memory",
        },
        memoryType: {
          type: "string",
          description: "Type of memory (default: 'general')",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_purge",
    description: "Purge all memory for a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID to purge memory for",
        },
      },
      required: ["projectId"],
    },
  },
];

// ============================================================================
// MCP Server Class
// ========================================================================


export class MCPServer {
  private taskManager: TaskManager;
  private orchestrator: AgentOrchestrator;
  private fileComm: ReturnType<typeof createFileCommunication>;

  constructor() {
    this.taskManager = new TaskManager();
    this.orchestrator = getOrchestrator();
    this.fileComm = createFileCommunication();
  }

  /**
   * Handle an MCP tool call
   */
  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    console.log(`[MCP] Handling tool call: ${toolName}`);

    switch (toolName) {
      case "tensionai_execute":
        return this.executeTask(args as ExecuteTaskParams);
      
      case "tensionai_status":
        return this.getStatus(args as GetStatusParams);
      
      case "tensionai_abort":
        return this.abortTask(args as AbortTaskParams);
      
      case "tensionai_list_tasks":
        return this.listTasks(args as { status?: TaskStatus; limit?: number });

      case "memory_search":
        return this.handleMemorySearch(args as { query: string; projectId?: string; limit?: number; threshold?: number });

      case "memory_write":
        return this.handleMemoryWrite(args as { content: string; projectId?: string; metadata?: Record<string, unknown>; memoryType?: string });

      case "memory_purge":
        return this.handleMemoryPurge(args as { projectId: string });

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Execute a task with TensionAI agents
   */
  private async executeTask(params: ExecuteTaskParams): Promise<{ taskId: string; status: string }> {
    const prompt = params.prompt;
    
    // Validate empty prompt
    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Prompt cannot be empty");
    }
    
    const projectId = params.projectId ?? "default";
    const qualityLevel = params.qualityLevel ?? "standard";
    const passThreshold = params.passThreshold ?? 7;

    // Get quality level config or use overrides
    let maxSprints = params.maxSprints ?? 10;
    let maxRetriesPerSprint = 3;

    if (!params.maxSprints) {
      const qualityConfig = getQualityLevelConfig(qualityLevel);
      maxSprints = qualityConfig.maxSprints;
      maxRetriesPerSprint = qualityConfig.maxRetriesPerSprint;
    }

    // Create task
    const taskId = await this.taskManager.createTask(
      prompt,
      projectId,
      qualityLevel,
      maxSprints,
      maxRetriesPerSprint,
      passThreshold
    );

    console.log(`[MCP] Created task ${taskId} with quality level ${qualityLevel}`);

    // Initialize file communication workspace
    await this.fileComm.initialize(taskId);

    // Update task status to running
    this.taskManager.updateTask(taskId, { status: "running" });

    // Start task execution in background
    this.runTask(taskId, prompt, projectId, qualityLevel, maxSprints, maxRetriesPerSprint, passThreshold)
      .catch(error => {
        console.error(`[MCP] Task ${taskId} failed:`, error);
        this.taskManager.updateTask(taskId, {
          status: "failed",
          error: (error as Error).message,
        });
      });

    return {
      taskId,
      status: "running",
    };
  }

  /**
   * Run the task asynchronously
   */
  private async runTask(
    taskId: string,
    prompt: string,
    projectId: string,
    qualityLevel: QualityLevel,
    maxSprints: number,
    maxRetriesPerSprint: number,
    passThreshold: number
  ): Promise<void> {
    // Check if aborted before starting
    if (this.taskManager.isAborted(taskId)) {
      this.taskManager.updateTask(taskId, { status: "aborted" });
      return;
    }

    try {
      const result = await this.orchestrator.executeTask({
        id: taskId,
        prompt,
        projectId,
        qualityLevel,
        maxSprints,
        maxRetriesPerSprint,
        passThreshold,
        createdAt: new Date(),
      });

      // Update task with result
      this.taskManager.updateTask(taskId, result);
      console.log(`[MCP] Task ${taskId} completed with status: ${result.status}`);
    } catch (error) {
      this.taskManager.updateTask(taskId, {
        status: "failed",
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get task status
   */
  private getStatus(params: GetStatusParams): TaskResult | { error: string } {
    const task = this.taskManager.getTask(params.taskId);
    
    if (!task) {
      return { error: `Task ${params.taskId} not found` };
    }
    
    return task;
  }

  /**
   * Abort a running task
   */
  private abortTask(params: AbortTaskParams): { success: boolean; taskId: string } {
    const task = this.taskManager.getTask(params.taskId);
    
    if (!task) {
      return { success: false, taskId: params.taskId };
    }

    if (task.status === "completed" || task.status === "failed" || task.status === "aborted") {
      return { success: false, taskId: params.taskId };
    }

    this.taskManager.setAborted(params.taskId);
    this.taskManager.updateTask(params.taskId, { status: "aborted" });
    
    return { success: true, taskId: params.taskId };
  }

  /**
   * List all tasks
   */
  private listTasks(params: { status?: TaskStatus; limit?: number }): TaskResult[] {
    const limit = params.limit ?? 20;
    const tasks = this.taskManager.getTasksArray();

    let filtered = tasks;
    if (params.status) {
      filtered = tasks.filter(t => t.status === params.status);
    }

    return filtered.slice(-limit).reverse();
  }

  /**
   * Handle memory search
   */
  private async handleMemorySearch(params: { query: string; projectId?: string; limit?: number; threshold?: number }): Promise<{
    results: Array<{ id: string; content: string; score: number }>;
    totalCount: number;
  }> {
    const result = await executeMemorySearch({
      query: params.query,
      projectId: params.projectId ?? "default",
      limit: params.limit,
      threshold: params.threshold,
    });

    return {
      results: result.entries.map((e, idx) => ({
        id: e.id,
        content: e.content,
        score: result.scores[idx],
      })),
      totalCount: result.totalCount,
    };
  }

  /**
   * Handle memory write
   */
  private async handleMemoryWrite(params: { content: string; projectId?: string; metadata?: Record<string, unknown>; memoryType?: string }): Promise<{
    id: string;
    success: boolean;
  }> {
    const entry = await executeMemoryWrite({
      content: params.content,
      projectId: params.projectId ?? "default",
      metadata: params.metadata,
      memoryType: params.memoryType,
    });

    return {
      id: entry.id,
      success: true,
    };
  }

  /**
   * Handle memory purge
   */
  private async handleMemoryPurge(params: { projectId: string }): Promise<{ deletedCount: number }> {
    return executeMemoryPurge({
      projectId: params.projectId,
    });
  }

  /**
   * Get available tools
   */
  getTools() {
    return MCP_TOOLS;
  }
}

// ============================================================================
// Server Instance
// ============================================================================

let mcpServerInstance: MCPServer | null = null;

export function getMCPServer(): MCPServer {
  if (!mcpServerInstance) {
    mcpServerInstance = new MCPServer();
  }
  return mcpServerInstance;
}

export function createMCPServer(): MCPServer {
  return new MCPServer();
}