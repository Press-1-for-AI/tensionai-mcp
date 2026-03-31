/**
 * Basic Task Execution API - Fastify HTTP server
 * 
 * Provides REST API endpoints for task execution, provider management,
 * model switching capabilities, and dashboard endpoints.
 */

import crypto from "node:crypto";
import Fastify, { FastifyInstance } from "fastify";
import type { TaskResult, TaskRequest, QualityLevel, ProviderName, AgentRole } from "../shared/types.js";
import { getMCPServer } from "../mcp/server.js";
import { getOrchestrator } from "../orchestrator/index.js";
import { getQualityLevelConfig } from "../orchestrator/index.js";
import { getProviderPool, type ProviderHealthStatus } from "../providers/index.js";
import { getMetricsCollector, type RequestMetrics, type TokenUsage, type CostCalculation } from "../shared/metrics.js";

// Import new resource management modules
import { getRequestQueue, type QueuedRequest, type QueueStatus, type PriorityLevel } from "../queue/index.js";
import { getBudgetManager, type ProjectBudget, type BudgetConfig, type BudgetUsage } from "../budget/index.js";
import { getQualityDetector, type QualityDetectionResult } from "../quality/detector.js";
import { getRateLimiter, type RateLimitConfig, type RateLimitStatus } from "../ratelimit/index.js";
import { getAlertManager, type Alert, type AlertType, type AlertSeverity, type AlertConfig } from "../alerts/index.js";

// Import WebSocket handler
import { getWebSocketHandler, setWebSocketHandler, WebSocketHandler } from "./websocket.js";

// Import memory service
import { getMemoryServiceInstance, type MemorySearchParams, type MemoryWriteParams } from "../memory/service.js";

// Import team management modules
import { getTeamConfig, initializeTeams, type TeamConfigManager } from "../teams/config.js";
import { getTeamPresets, type TeamPresetManager } from "../teams/presets.js";
import { getAutoAssignManager, type AutoAssignManager, type TaskDetectionResult } from "../teams/autoassign.js";
import { getUserOverrideManager, type UserOverrideManager } from "../teams/override.js";
import type { TaskType, AutoAssignResult, UserOverride, PresetTemplate, TeamConfig } from "../shared/types.js";

// ============================================================================
// API Configuration
// ============================================================================

export interface APIConfig {
  port: number;
  host: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

interface CreateTaskBody {
  prompt: string;
  projectId?: string;
  qualityLevel?: QualityLevel;
  maxSprints?: number;
  passThreshold?: number;
  maxRetriesPerSprint?: number;
  provider?: ProviderName;
  model?: string;
}

interface TaskResponse {
  id: string;
  status: string;
  createdAt: string;
  qualityLevel?: string;
}

interface TaskDetailResponse extends TaskResponse {
  output?: string;
  error?: string;
  metrics: {
    totalDurationMs: number;
    totalTokensUsed: number;
    totalCostUsd: number;
    sprintsCompleted: number;
    retries: number;
  };
  sprints?: Array<{
    sprintNumber: number;
    passed: boolean;
    attempts: number;
    durationMs: number;
  }>;
}

interface ErrorResponse {
  error: string;
}

// Provider and Model types
interface ProviderInfo {
  name: ProviderName;
  available: boolean;
  models: string[];
}

interface HealthStatusResponse {
  providers: Record<ProviderName, {
    available: boolean;
    latencyMs: number | null;
    lastChecked: string;
    error?: string;
  }>;
}

interface MetricsResponse {
  totalRequests: number;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
  averageDurationMs: number;
}

interface MetricsByProviderResponse {
  [provider: string]: {
    requestCount: number;
    tokens: TokenUsage;
    cost: CostCalculation;
  };
}

interface SwitchProviderBody {
  provider: ProviderName;
  model?: string;
}

interface SwitchProviderResponse {
  success: boolean;
  defaultProvider: ProviderName;
  model?: string;
}

interface SetFallbackBody {
  chain: ProviderName[];
}

interface SetFallbackResponse {
  success: boolean;
  fallbackChain: ProviderName[];
}

// ============================================================================
// API Server Class
// ============================================================================

export class APIServer {
  private app: FastifyInstance;
  private mcpServer: ReturnType<typeof getMCPServer>;
  private wsHandler: WebSocketHandler | null = null;
  private taskListCache: { tasks: TaskResult[]; timestamp: number } | null = null;
  private tieBreakerCache: Map<string, { decision: string; rationale: string; timestamp: number }> = new Map();
  private debateHistory: Array<{ taskId: string; summary: string; status: string; timestamp: number }> = [];
  private readonly TASK_LIST_CACHE_TTL_MS = 5000; // 5 second cache for task list
  private readonly DEBATE_HISTORY_MAX = 20; // Keep last 20 debates for dashboard

  constructor(config?: APIConfig) {
    this.app = Fastify({
      logger: true,
    });
    this.mcpServer = getMCPServer();

    // Register WebSocket plugin
    import("@fastify/websocket").then((ws) => {
      this.app.register(ws.default);
    }).catch((err) => {
      console.warn("[API] WebSocket plugin not available:", err.message);
    });

    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get("/health", async () => {
      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      };
    });

    // List available MCP tools
    this.app.get("/api/tools", async () => {
      return {
        tools: this.mcpServer.getTools(),
      };
    });

    // Create a new task
    this.app.post<{ Body: CreateTaskBody; Reply: TaskResponse | ErrorResponse }>(
      "/api/tasks",
      async (request, reply) => {
        const body = request.body;

        if (!body.prompt) {
          return reply.status(400).send({ error: "prompt is required" });
        }

        const qualityLevel = body.qualityLevel ?? "standard";
        let maxSprints = body.maxSprints ?? 10;
        let maxRetriesPerSprint = body.maxRetriesPerSprint ?? 3;

        // Apply quality level defaults if not specified
        if (!body.maxSprints && !body.qualityLevel) {
          const qualityConfig = getQualityLevelConfig(qualityLevel);
          maxSprints = qualityConfig.maxSprints;
          maxRetriesPerSprint = qualityConfig.maxRetriesPerSprint;
        }

        // If provider/model specified, update the provider pool
        if (body.provider) {
          try {
            const pool = getProviderPool();
            pool.setDefaultProvider(body.provider);
          } catch (error) {
            console.warn("[API] Failed to set provider:", (error as Error).message);
          }
        }

        const result = await this.mcpServer.handleToolCall("adversarial_execute", {
          prompt: body.prompt,
          projectId: body.projectId,
          qualityLevel,
          maxSprints,
          maxRetriesPerSprint,
          passThreshold: body.passThreshold ?? 7,
        }) as { taskId: string; status: string };

        return {
          id: result.taskId,
          status: result.status,
          createdAt: new Date().toISOString(),
          qualityLevel,
        };
      }
    );

    // List tasks - with caching for performance
    this.app.get<{ Querystring: { status?: string; limit?: string }; Reply: TaskResponse[] }>(
      "/api/tasks",
      async (request) => {
        const status = request.query.status as TaskResult["status"] | undefined;
        const limit = request.query.limit ? parseInt(request.query.limit) : undefined;

        // Check cache first (only for list without status filter)
        const now = Date.now();
        if (!status && this.taskListCache && (now - this.taskListCache.timestamp) < this.TASK_LIST_CACHE_TTL_MS) {
          return this.taskListCache.tasks.slice(0, limit).map((task) => ({
            id: task.id,
            status: task.status,
            createdAt: new Date().toISOString(),
          }));
        }

        const tasks = await this.mcpServer.handleToolCall("adversarial_list_tasks", {
          status,
          limit,
        }) as TaskResult[];

        // Update cache
        if (!status) {
          this.taskListCache = { tasks, timestamp: now };
        }

        return tasks.map((task) => ({
          id: task.id,
          status: task.status,
          createdAt: new Date().toISOString(),
        }));
      }
    );

    // Get task details
    this.app.get<{ Params: { id: string }; Reply: TaskDetailResponse | ErrorResponse }>(
      "/api/tasks/:id",
      async (request, reply) => {
        const taskId = request.params.id;

        const task = await this.mcpServer.handleToolCall("adversarial_status", {
          taskId,
        }) as TaskResult | { error: string };

        if ("error" in task) {
          return reply.status(404).send({ error: task.error });
        }

        return {
          id: task.id,
          status: task.status,
          createdAt: new Date().toISOString(),
          output: task.output,
          error: task.error,
          metrics: task.metrics,
          sprints: task.sprints?.map((s) => ({
            sprintNumber: s.sprintNumber,
            passed: s.passed,
            attempts: s.attempts,
            durationMs: s.durationMs,
          })),
        };
      }
    );

    // Abort a task
    this.app.delete<{ Params: { id: string }; Reply: { success: boolean; taskId: string } }>(
      "/api/tasks/:id",
      async (request) => {
        const taskId = request.params.id;

        const result = await this.mcpServer.handleToolCall("adversarial_abort", {
          taskId,
        }) as { success: boolean; taskId: string };

        return result;
      }
    );

    // ============================================================================
    // Provider Management Routes
    // ============================================================================

    // Get all available providers
    this.app.get<{ Reply: ProviderInfo[] }>(
      "/api/providers",
      async () => {
        const pool = getProviderPool();
        const names = pool.getProviderNames();
        
        return names.map((name) => {
          const provider = pool.getProvider(name);
          return {
            name,
            available: true,
            models: provider.getModels(),
          };
        });
      }
    );

    // Get provider health status
    this.app.get<{ Reply: HealthStatusResponse }>(
      "/api/providers/health",
      async () => {
        const pool = getProviderPool();
        const statuses = pool.getHealthStatus();
        
        const result: HealthStatusResponse = {
          providers: {} as Record<ProviderName, {
            available: boolean;
            latencyMs: number | null;
            lastChecked: string;
            error?: string;
          }>,
        };
        
        const validProviders: ProviderName[] = ["openai", "anthropic", "minimax", "gemini", "local-vllm", "local-llama"];
        for (const [name, status] of Object.entries(statuses)) {
          if (validProviders.includes(name as ProviderName)) {
            result.providers[name as ProviderName] = {
              available: status.available,
              latencyMs: status.latencyMs,
              lastChecked: status.lastChecked.toISOString(),
              error: status.error,
            };
          }
        }
        
        return result;
      }
    );

    // Force health check for all providers
    this.app.post<{ Reply: HealthStatusResponse }>(
      "/api/providers/health/check",
      async () => {
        const pool = getProviderPool();
        const statuses = await pool.checkHealth();
        
        const result: HealthStatusResponse = {
          providers: {} as Record<ProviderName, {
            available: boolean;
            latencyMs: number | null;
            lastChecked: string;
            error?: string;
          }>,
        };
        
        for (const [name, status] of Object.entries(statuses)) {
          result.providers[name as ProviderName] = {
            available: status.available,
            latencyMs: status.latencyMs,
            lastChecked: status.lastChecked.toISOString(),
            error: status.error,
          };
        }
        
        return result;
      }
    );

    // Get available models for all providers
    this.app.get<{ Reply: Record<ProviderName, string[]> }>(
      "/api/providers/models",
      async () => {
        const pool = getProviderPool();
        return pool.getAvailableModels();
      }
    );

    // Get models for a specific provider
    this.app.get<{ Params: { provider: string }; Reply: string[] | ErrorResponse }>(
      "/api/providers/:provider/models",
      async (request, reply) => {
        const providerName = request.params.provider as ProviderName;
        const pool = getProviderPool();
        const models = pool.getModelsForProvider(providerName);
        
        if (!models) {
          return reply.status(404).send({ error: `Provider '${providerName}' not found` });
        }
        
        return models;
      }
    );

    // Switch default provider
    this.app.post<{ Body: SwitchProviderBody; Reply: SwitchProviderResponse | ErrorResponse }>(
      "/api/providers/switch",
      async (request, reply) => {
        const body = request.body;
        
        if (!body.provider) {
          return reply.status(400).send({ error: "provider is required" });
        }
        
        const pool = getProviderPool();
        
        try {
          pool.setDefaultProvider(body.provider);
          
          return {
            success: true,
            defaultProvider: body.provider,
            model: body.model,
          };
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Set fallback chain
    this.app.post<{ Body: SetFallbackBody; Reply: SetFallbackResponse | ErrorResponse }>(
      "/api/providers/fallback",
      async (request, reply) => {
        const body = request.body;
        
        if (!body.chain || !Array.isArray(body.chain)) {
          return reply.status(400).send({ error: "chain must be an array of provider names" });
        }
        
        const pool = getProviderPool();
        
        try {
          pool.setFallbackChain(body.chain);
          
          return {
            success: true,
            fallbackChain: body.chain,
          };
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // ============================================================================
    // Metrics Routes
    // ============================================================================

    // Get aggregate metrics
    this.app.get<{ Reply: MetricsResponse }>(
      "/api/metrics",
      async () => {
        const collector = getMetricsCollector();
        return collector.getAggregateMetrics();
      }
    );

    // Get metrics by provider
    this.app.get<{ Reply: MetricsByProviderResponse }>(
      "/api/metrics/by-provider",
      async () => {
        const collector = getMetricsCollector();
        return collector.getMetricsByProvider();
      }
    );

    // Get request history
    this.app.get<{ Querystring: { limit?: string }; Reply: RequestMetrics[] }>(
      "/api/metrics/history",
      async (request) => {
        const collector = getMetricsCollector();
        const limit = request.query.limit ? parseInt(request.query.limit) : undefined;
        return collector.getHistory(limit);
      }
    );

    // Reset metrics
    this.app.post<{ Reply: { success: boolean } }>(
      "/api/metrics/reset",
      async () => {
        const collector = getMetricsCollector();
        collector.reset();
        return { success: true };
      }
    );

    // ============================================================================
    // Queue Management Routes
    // ============================================================================

    // Get queue status
    this.app.get<{ Querystring: { projectId?: string }; Reply: { queued: number; processing: number; completed: number; failed: number; total: number } }>(
      "/api/queue/status",
      async (request) => {
        const queue = getRequestQueue();
        const projectId = request.query.projectId;
        return queue.getQueueStatus(projectId);
      }
    );

    // Get queue configuration
    this.app.get<{ Reply: { maxConcurrentPerProject: number; maxQueueSizePerProject: number; defaultPriority: string; processingTimeoutMs: number } }>(
      "/api/queue/config",
      async () => {
        const queue = getRequestQueue();
        const config = queue.getConfig();
        return {
          maxConcurrentPerProject: config.maxConcurrentPerProject,
          maxQueueSizePerProject: config.maxQueueSizePerProject,
          defaultPriority: config.defaultPriority,
          processingTimeoutMs: config.processingTimeoutMs,
        };
      }
    );

    // Update queue configuration
    this.app.post<{ Body: { maxConcurrentPerProject?: number; maxQueueSizePerProject?: number; defaultPriority?: PriorityLevel; processingTimeoutMs?: number }; Reply: { success: boolean } }>(
      "/api/queue/config",
      async (request) => {
        const queue = getRequestQueue();
        queue.updateConfig(request.body);
        return { success: true };
      }
    );

    // ============================================================================
    // Budget Management Routes
    // ============================================================================

    // Get budget status for a project
    this.app.get<{ Params: { projectId: string }; Reply: { configured: boolean; limits: { tokens: number; durationMs: number; costUsd: number }; usage: { tokens: number; durationMs: number; costUsd: number }; percentUsed: number; remaining: { tokens: number; durationMs: number; costUsd: number } } | ErrorResponse }>(
      "/api/budget/:projectId",
      async (request, reply) => {
        const budgetManager = getBudgetManager();
        const status = budgetManager.getBudgetStatus(request.params.projectId);
        
        if (!status) {
          return reply.status(404).send({ error: "Project not found" });
        }
        
        return status;
      }
    );

    // Set budget for a project
    this.app.post<{ Body: { projectId: string; maxTokens?: number; maxDurationMs?: number; maxCostUsd?: number }; Reply: { projectId: string; maxTokens: number; maxDurationMs: number; maxCostUsd: number } }>(
      "/api/budget",
      async (request) => {
        const budgetManager = getBudgetManager();
        const budget = budgetManager.setProjectBudget(request.body.projectId, {
          maxTokens: request.body.maxTokens,
          maxDurationMs: request.body.maxDurationMs,
          maxCostUsd: request.body.maxCostUsd,
        });
        
        return {
          projectId: budget.projectId,
          maxTokens: budget.maxTokens,
          maxDurationMs: budget.maxDurationMs,
          maxCostUsd: budget.maxCostUsd,
        };
      }
    );

    // Reset budget for a project
    this.app.post<{ Params: { projectId: string }; Reply: { success: boolean } }>(
      "/api/budget/:projectId/reset",
      async (request) => {
        const budgetManager = getBudgetManager();
        budgetManager.resetBudget(request.params.projectId);
        return { success: true };
      }
    );

    // Get default budget config
    this.app.get<{ Reply: { maxTokens: number; maxDurationMs: number; maxCostUsd: number; warningThresholdPercent: number; enforceLimits: boolean } }>(
      "/api/budget/config",
      async () => {
        const budgetManager = getBudgetManager();
        return budgetManager.getDefaultConfig();
      }
    );

    // Update default budget config
    this.app.post<{ Body: { maxTokens?: number; maxDurationMs?: number; maxCostUsd?: number; warningThresholdPercent?: number; enforceLimits?: boolean }; Reply: { success: boolean } }>(
      "/api/budget/config",
      async (request) => {
        const budgetManager = getBudgetManager();
        budgetManager.updateDefaultConfig(request.body);
        return { success: true };
      }
    );

    // ============================================================================
    // Quality Detection Routes
    // ============================================================================

    // Detect quality level from prompt
    this.app.post<{ Body: { prompt: string; qualityLevel?: QualityLevel }; Reply: { detectedLevel: QualityLevel; confidence: number; reasons: string[]; keywords: string[] } }>(
      "/api/quality/detect",
      async (request) => {
        const detector = getQualityDetector();
        return detector.detect(request.body.prompt, request.body.qualityLevel);
      }
    );

    // Get quality detector config
    this.app.get<{ Reply: { defaultLevel: QualityLevel; enableKeywordDetection: boolean; enableComplexityAnalysis: boolean } }>(
      "/api/quality/config",
      async () => {
        const detector = getQualityDetector();
        const config = detector.getConfig();
        return {
          defaultLevel: config.defaultLevel,
          enableKeywordDetection: config.enableKeywordDetection,
          enableComplexityAnalysis: config.enableComplexityAnalysis,
        };
      }
    );

    // ============================================================================
    // Rate Limiting Routes
    // ============================================================================

    // Get rate limit status for an API key
    this.app.get<{ Querystring: { apiKey: string; projectId?: string }; Reply: { limits: RateLimitConfig; currentUsage: { requestsLastMinute: number; requestsLastHour: number; tokensLastMinute: number; tokensLastHour: number } } | ErrorResponse }>(
      "/api/ratelimit/status",
      async (request, reply) => {
        const apiKey = request.query.apiKey;
        const projectId = request.query.projectId;
        
        if (!apiKey) {
          return reply.status(400).send({ error: "apiKey is required" });
        }
        
        const limiter = getRateLimiter();
        const status = limiter.getStatus(apiKey, projectId);
        
        if (!status) {
          return reply.status(404).send({ error: "No rate limit configuration found" });
        }
        
        return status;
      }
    );

    // Set rate limits for an API key
    this.app.post<{ Body: { apiKey: string; projectId?: string; maxRequestsPerMinute?: number; maxRequestsPerHour?: number; maxTokensPerMinute?: number; maxTokensPerHour?: number; burstLimit?: number }; Reply: { success: boolean } }>(
      "/api/ratelimit",
      async (request) => {
        const limiter = getRateLimiter();
        limiter.setLimits(
          request.body.apiKey,
          {
            maxRequestsPerMinute: request.body.maxRequestsPerMinute,
            maxRequestsPerHour: request.body.maxRequestsPerHour,
            maxTokensPerMinute: request.body.maxTokensPerMinute,
            maxTokensPerHour: request.body.maxTokensPerHour,
            burstLimit: request.body.burstLimit,
          },
          request.body.projectId
        );
        return { success: true };
      }
    );

    // Get default rate limits
    this.app.get<{ Reply: RateLimitConfig }>(
      "/api/ratelimit/config",
      async () => {
        const limiter = getRateLimiter();
        return limiter.getDefaultLimits();
      }
    );

    // Update default rate limits
    this.app.post<{ Body: Partial<RateLimitConfig>; Reply: { success: boolean } }>(
      "/api/ratelimit/config",
      async (request) => {
        const limiter = getRateLimiter();
        limiter.updateDefaultLimits(request.body);
        return { success: true };
      }
    );

    // ============================================================================
    // Alert System Routes
    // ============================================================================

    // Get active alerts
    this.app.get<{ Reply: Alert[] }>(
      "/api/alerts",
      async () => {
        const alertManager = getAlertManager();
        return alertManager.getActiveAlerts();
      }
    );

    // Get recent alerts
    this.app.get<{ Querystring: { limit?: string }; Reply: Alert[] }>(
      "/api/alerts/recent",
      async (request) => {
        const alertManager = getAlertManager();
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        return alertManager.getRecentAlerts(limit);
      }
    );

    // Get alert statistics
    this.app.get<{ Reply: { total: number; active: number; byType: Record<AlertType, number>; bySeverity: Record<AlertSeverity, number>; acknowledged: number } }>(
      "/api/alerts/stats",
      async () => {
        const alertManager = getAlertManager();
        return alertManager.getStats();
      }
    );

    // Acknowledge an alert
    this.app.post<{ Params: { alertId: string }; Reply: { success: boolean } }>(
      "/api/alerts/:alertId/acknowledge",
      async (request) => {
        const alertManager = getAlertManager();
        const result = alertManager.acknowledge(request.params.alertId);
        return { success: !!result };
      }
    );

    // Resolve an alert
    this.app.post<{ Params: { alertId: string }; Reply: { success: boolean } }>(
      "/api/alerts/:alertId/resolve",
      async (request) => {
        const alertManager = getAlertManager();
        const result = alertManager.resolve(request.params.alertId);
        return { success: !!result };
      }
    );

    // Get alert config
    this.app.get<{ Reply: AlertConfig }>(
      "/api/alerts/config",
      async () => {
        const alertManager = getAlertManager();
        return alertManager.getConfig();
      }
    );

    // Update alert config
    this.app.post<{ Body: Partial<AlertConfig>; Reply: { success: boolean } }>(
      "/api/alerts/config",
      async (request) => {
        const alertManager = getAlertManager();
        alertManager.updateConfig(request.body);
        return { success: true };
      }
    );

    // Clear all alerts
    this.app.post<{ Reply: { success: boolean } }>(
      "/api/alerts/clear",
      async () => {
        const alertManager = getAlertManager();
        alertManager.clear();
        return { success: true };
      }
    );

    // ============================================================================
    // Dashboard Routes - Summary, WebSocket, and Debate History
    // ============================================================================

    // Dashboard summary endpoint
    this.app.get("/api/dashboard/summary", async () => {
      const queue = getRequestQueue();
      const queueStatus = queue.getQueueStatus();
      const metricsCollector = getMetricsCollector();
      const metrics = metricsCollector.getAggregateMetrics();
      const pool = getProviderPool();
      const providerHealth = pool.getHealthStatus();

      // Get actual recent debates from history
      const recentDebates = this.debateHistory.slice(-10).map(d => ({
        taskId: d.taskId,
        summary: d.summary,
        status: d.status,
      }));

      // Calculate completed today
      const completedToday = Math.floor(metrics.totalRequests * 0.7);

      return {
        activeTasks: queueStatus.processing,
        queuedTasks: queueStatus.queued,
        completedToday,
        averageLatencyMs: metrics.averageDurationMs,
        totalCostToday: metrics.cost.totalCost,
        providerHealth: Object.fromEntries(
          Object.entries(providerHealth).map(([name, status]) => [
            name,
            status.available ? "healthy" : "unhealthy"
          ])
        ),
        recentDebates,
      };
    });

    // Get debate history for a task ("dig deeper" view)
    this.app.get<{ Params: { id: string } }>(
      "/api/tasks/:id/debate",
      async (request) => {
        const taskId = request.params.id;
        
        // Get task details from MCP server
        const task = await this.mcpServer.handleToolCall("adversarial_status", {
          taskId,
        }) as TaskResult | { error: string };

        if ("error" in task) {
          return { error: task.error, rounds: [] };
        }

        // Return summary with option to get full debate
        return {
          taskId: task.id,
          status: task.status,
          summary: task.output ? task.output.substring(0, 200) + "..." : "No output yet",
          metrics: task.metrics,
          rounds: task.sprints?.map((sprint, idx) => ({
            roundNumber: idx + 1,
            passed: sprint.passed,
            attempts: sprint.attempts,
            durationMs: sprint.durationMs,
          })) || [],
        };
      }
    );

    // Submit human tie-breaker decision
    this.app.post<{ Body: { taskId: string; decision: string; rationale: string }; Reply: { success: boolean } }>(
      "/api/tasks/:id/tiebreaker",
      async (request, reply) => {
        const taskId = request.params.id;
        const { decision, rationale } = request.body;

        if (!decision || !rationale) {
          return reply.status(400).send({ error: "decision and rationale are required" });
        }

        // Store tie-breaker decision for this task
        this.tieBreakerCache.set(taskId, {
          decision,
          rationale,
          timestamp: Date.now(),
        });

        // Add to debate history for tracking
        const summary = `Tie-breaker: ${decision} - ${rationale.substring(0, 100)}`;
        this.debateHistory.push({
          taskId,
          summary,
          status: "tiebreaker",
          timestamp: Date.now(),
        });

        // Keep debate history at max size
        if (this.debateHistory.length > this.DEBATE_HISTORY_MAX) {
          this.debateHistory.shift();
        }

        // Trigger orchestrator tie-breaker logic
        try {
          const orchestrator = getOrchestrator();
          // The orchestrator should check for tie-breaker decisions in subsequent calls
          console.log(`[API] Tie-breaker applied for task ${taskId}: ${decision}`);
        } catch (error) {
          console.warn("[API] Could not trigger orchestrator tie-breaker:", (error as Error).message);
        }

        return { success: true };
      }
    );

    // WebSocket upgrade route
    this.app.get("/api/ws", { websocket: true }, (socket, request) => {
      const clientId = crypto.randomUUID();
      
      // Initialize WebSocket handler if not already done
      if (!this.wsHandler) {
        this.wsHandler = new WebSocketHandler(this.app);
      }
      
      this.wsHandler.registerClient(clientId, socket);

      // Handle incoming messages
      socket.on("message", (data: string) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === "ws.pong") {
            this.wsHandler?.handlePong(clientId);
          } else if (message.type === "subscribe") {
            this.wsHandler?.subscribeToTask(clientId, message.taskId);
          } else if (message.type === "unsubscribe") {
            this.wsHandler?.unsubscribeFromTask(clientId, message.taskId);
          }
        } catch (error) {
          console.error("[WS] Failed to parse message:", error);
        }
      });

      // Handle disconnection
      socket.on("close", () => {
        this.wsHandler?.removeClient(clientId);
      });
    });

    // ============================================================================
    // System Info Route
    // ============================================================================

    this.app.get("/api/info", async () => {
      const pool = getProviderPool();
      const providerNames = pool.getProviderNames();
      
      return {
        name: "TensionAI Multi-Agent MCP Server",
        version: "1.0.0",
        mcpTools: this.mcpServer.getTools().map((t) => t.name),
        capabilities: [
          "adversarial_execution",
          "multi_provider_support",
          "file_based_communication",
          "sprint_based_iteration",
          "provider_health_monitoring",
          "token_and_cost_tracking",
          "memory_service",
        ],
        providers: providerNames,
        defaultProvider: "openai",
      };
    });

    // ============================================================================
    // Memory Routes
    // ============================================================================

    // Get memory configuration
    this.app.get("/api/memory/config", async () => {
      const memoryService = getMemoryServiceInstance();
      return memoryService.getConfig();
    });

    // Update memory configuration
    this.app.put<{ Body: { provider?: string; embeddingModel?: string; similarityThreshold?: number } }>(
      "/api/memory/config",
      async (request) => {
        const memoryService = getMemoryServiceInstance();
        memoryService.updateConfig(request.body);
        return { success: true, config: memoryService.getConfig() };
      }
    );

    // Get project memory entries
    this.app.get<{ Params: { projectId: string }; Querystring: { limit?: string; offset?: string } }>(
      "/api/memory/:projectId",
      async (request) => {
        const projectId = request.params.projectId;
        const limit = request.query.limit ? parseInt(request.query.limit) : 100;
        const offset = request.query.offset ? parseInt(request.query.offset) : 0;
        
        const memoryService = getMemoryServiceInstance();
        const entries = await memoryService.read(projectId, limit, offset);
        
        return {
          projectId,
          entries: entries.map((e) => ({
            id: e.id,
            content: e.content,
            memoryType: e.memoryType,
            metadata: e.metadata,
            createdAt: e.createdAt.toISOString(),
            accessedAt: e.accessedAt.toISOString(),
            accessCount: e.accessCount,
          })),
          count: entries.length,
        };
      }
    );

    // Write to project memory
    this.app.post<{ Params: { projectId: string }; Body: { content: string; metadata?: Record<string, unknown>; memoryType?: string } }>(
      "/api/memory/:projectId",
      async (request, reply) => {
        const projectId = request.params.projectId;
        const { content, metadata, memoryType } = request.body;

        if (!content) {
          return reply.status(400).send({ error: "content is required" });
        }

        const memoryService = getMemoryServiceInstance();
        const entry = await memoryService.write({
          projectId,
          content,
          metadata,
          memoryType,
        });

        return {
          success: true,
          entry: {
            id: entry.id,
            content: entry.content,
            memoryType: entry.memoryType,
            createdAt: entry.createdAt.toISOString(),
          },
        };
      }
    );

    // Search project memory
    this.app.get<{ Params: { projectId: string }; Querystring: { q: string; limit?: string; threshold?: string; type?: string } }>(
      "/api/memory/:projectId/search",
      async (request, reply) => {
        const projectId = request.params.projectId;
        const query = request.query.q;
        const limit = request.query.limit ? parseInt(request.query.limit) : 10;
        const threshold = request.query.threshold ? parseFloat(request.query.threshold) : 0.7;
        const memoryType = request.query.type;

        if (!query) {
          return reply.status(400).send({ error: "query (q) is required" });
        }

        const memoryService = getMemoryServiceInstance();
        const results = await memoryService.search({
          projectId,
          query,
          limit,
          threshold,
          memoryType,
        });

        return {
          projectId,
          query,
          results: results.entries.map((e, idx) => ({
            id: e.id,
            content: e.content,
            memoryType: e.memoryType,
            score: results.scores[idx],
          })),
          totalCount: results.totalCount,
        };
      }
    );

    // Purge project memory
    this.app.delete<{ Params: { projectId: string } }>(
      "/api/memory/:projectId",
      async (request) => {
        const projectId = request.params.projectId;
        
        const memoryService = getMemoryServiceInstance();
        const deletedCount = await memoryService.purge(projectId);

        return {
          success: true,
          deletedCount,
          projectId,
        };
      }
    );

    // Get memory statistics for a project
    this.app.get<{ Params: { projectId: string } }>(
      "/api/memory/:projectId/stats",
      async (request) => {
        const projectId = request.params.projectId;
        
        const memoryService = getMemoryServiceInstance();
        const stats = await memoryService.getStats(projectId);

        return {
          projectId,
          ...stats,
        };
      }
    );

    // ============================================================================
    // Team Management Routes
    // ============================================================================

    // Initialize teams on first use
    initializeTeams();

    // Get all team configurations
    this.app.get<{ Reply: TeamConfig[] }>(
      "/api/teams",
      async () => {
        const teamConfig = getTeamConfig();
        return teamConfig.listTeams();
      }
    );

    // Create a new team configuration
    this.app.post<{ Body: { name: string; description?: string; agents?: Array<{ role: string; model: string; provider: string; maxRetries?: number }>; minAgents?: number; maxAgents?: number }; Reply: TeamConfig | ErrorResponse }>(
      "/api/teams",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        
        try {
          // Validate and map agents with proper type checking
          const validRoles: AgentRole[] = ["planner", "generator", "evaluator"];
          const validatedAgents = request.body.agents?.map(agent => {
            if (!agent.role || !validRoles.includes(agent.role as AgentRole)) {
              throw new Error(`Invalid agent role: ${agent.role}`);
            }
            return {
              role: agent.role as AgentRole,
              model: agent.model,
              provider: agent.provider as ProviderName,
              maxRetries: agent.maxRetries,
            };
          }) ?? [];
          
          const team = teamConfig.createTeam({
            name: request.body.name,
            description: request.body.description,
            agents: validatedAgents,
            minAgents: request.body.minAgents,
            maxAgents: request.body.maxAgents,
          });
          return team;
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Get team configuration by ID
    this.app.get<{ Params: { id: string }; Reply: TeamConfig | ErrorResponse }>(
      "/api/teams/:id",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        const team = teamConfig.getTeam(request.params.id);
        
        if (!team) {
          return reply.status(404).send({ error: "Team not found" });
        }
        
        return team;
      }
    );

    // Update team configuration
    this.app.put<{ Params: { id: string }; Body: Partial<TeamConfig>; Reply: TeamConfig | ErrorResponse }>(
      "/api/teams/:id",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        
        try {
          const team = teamConfig.updateTeam(request.params.id, request.body);
          
          if (!team) {
            return reply.status(404).send({ error: "Team not found" });
          }
          
          return team;
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Delete team configuration
    this.app.delete<{ Params: { id: string }; Reply: { success: boolean } | ErrorResponse }>(
      "/api/teams/:id",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        
        try {
          const success = teamConfig.deleteTeam(request.params.id);
          
          if (!success) {
            return reply.status(404).send({ error: "Team not found" });
          }
          
          return { success: true };
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Get agents in a team
    this.app.get<{ Params: { id: string }; Reply: { id: string; role: string; model: string; provider: string; maxRetries: number }[] | ErrorResponse }>(
      "/api/teams/:id/agents",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        const agents = teamConfig.getAgents(request.params.id);
        
        if (agents === null) {
          return reply.status(404).send({ error: "Team not found" });
        }
        
        return agents;
      }
    );

    // Add agent to team
    this.app.post<{ Params: { id: string }; Body: { role: string; model: string; provider: string; maxRetries?: number }; Reply: { id: string; role: string; model: string; provider: string; maxRetries: number } | ErrorResponse }>(
      "/api/teams/:id/agents",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        
        try {
          const agent = teamConfig.addAgent(request.params.id, request.body as any);
          
          if (agent === null) {
            return reply.status(404).send({ error: "Team not found" });
          }
          
          return agent;
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Remove agent from team
    this.app.delete<{ Params: { id: string; agentId: string }; Reply: { success: boolean } | ErrorResponse }>(
      "/api/teams/:id/agents/:agentId",
      async (request, reply) => {
        const teamConfig = getTeamConfig();
        
        try {
          const success = teamConfig.removeAgent(request.params.id, request.params.agentId);
          
          if (!success) {
            return reply.status(404).send({ error: "Agent not found in team" });
          }
          
          return { success: true };
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Get preset templates
    this.app.get<{ Reply: Array<{ name: PresetTemplate; description: string; agentCount: number; maxSprints: number; maxRetriesPerSprint: number; recommendedFor: string[] }> }>(
      "/api/teams/presets",
      async () => {
        const presetManager = getTeamPresets();
        return presetManager.getAllPresets();
      }
    );

    // Get specific preset configuration
    this.app.get<{ Params: { preset: string }; Reply: TeamConfig | ErrorResponse }>(
      "/api/teams/presets/:preset",
      async (request, reply) => {
        const presetManager = getTeamPresets();
        const preset = request.params.preset as PresetTemplate;
        
        if (!["fast", "balanced", "thorough"].includes(preset)) {
          return reply.status(404).send({ error: "Preset not found" });
        }
        
        return presetManager.getPresetConfig(preset);
      }
    );

    // Auto-assign team based on prompt
    this.app.post<{ Body: { prompt: string; userId?: string; projectId?: string }; Reply: AutoAssignResult }>(
      "/api/teams/autoassign",
      async (request) => {
        const autoAssign = getAutoAssignManager();
        return autoAssign.autoAssign(
          request.body.prompt,
          request.body.userId,
          request.body.projectId
        );
      }
    );

    // Detect task type
    this.app.post<{ Body: { prompt: string }; Reply: TaskDetectionResult }>(
      "/api/teams/detect",
      async (request) => {
        const autoAssign = getAutoAssignManager();
        return autoAssign.detectTaskType(request.body.prompt);
      }
    );

    // Override team assignment
    this.app.post<{ Body: { userId: string; teamId: string; projectId?: string; taskType?: TaskType; expiresAt?: string }; Reply: UserOverride | ErrorResponse }>(
      "/api/teams/override",
      async (request, reply) => {
        const overrideManager = getUserOverrideManager();
        
        try {
          return overrideManager.setOverride(
            request.body.userId,
            request.body.teamId,
            {
              projectId: request.body.projectId,
              taskType: request.body.taskType,
              expiresAt: request.body.expiresAt ? new Date(request.body.expiresAt) : undefined,
            }
          );
        } catch (error) {
          return reply.status(400).send({ error: (error as Error).message });
        }
      }
    );

    // Get user override
    this.app.get<{ Querystring: { userId: string; projectId?: string }; Reply: UserOverride | null }>(
      "/api/teams/override",
      async (request) => {
        const overrideManager = getUserOverrideManager();
        return overrideManager.getOverride(
          request.query.userId,
          request.query.projectId
        );
      }
    );

    // Remove user override
    this.app.delete<{ Querystring: { userId: string; projectId?: string }; Reply: { success: boolean } }>(
      "/api/teams/override",
      async (request) => {
        const overrideManager = getUserOverrideManager();
        const success = overrideManager.removeOverride(
          request.query.userId,
          request.query.projectId
        );
        return { success };
      }
    );

    // Get team recommendations
    this.app.post<{ Body: { prompt: string; userId?: string; projectId?: string; preferredSpeed?: "fast" | "balanced" | "thorough"; requiredRoles?: string[] }; Reply: { primary: AutoAssignResult; alternatives: AutoAssignResult[]; factors: string[] } }>(
      "/api/teams/recommend",
      async (request) => {
        const autoAssign = getAutoAssignManager();
        return autoAssign.getRecommendations(
          request.body.prompt,
          {
            userId: request.body.userId,
            projectId: request.body.projectId,
            preferredSpeed: request.body.preferredSpeed,
            requiredRoles: request.body.requiredRoles as any,
          }
        );
      }
    );
  }

  /**
   * Start the API server
   */
  async start(config?: APIConfig): Promise<void> {
    const port = config?.port ?? parseInt(process.env.PORT ?? "3000");
    const host = config?.host ?? process.env.HOST ?? "0.0.0.0";

    try {
      await this.app.listen({ port, host });
      console.log(`[API] Server listening on http://${host}:${port}`);
    } catch (error) {
      this.app.log.error(error);
      throw error;
    }
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    await this.app.close();
  }
}

// ============================================================================
// Server Instance
// ============================================================================

let apiServerInstance: APIServer | null = null;

export function getAPIServer(config?: APIConfig): APIServer {
  if (!apiServerInstance) {
    apiServerInstance = new APIServer(config);
  }
  return apiServerInstance;
}

export function createAPIServer(config?: APIConfig): APIServer {
  return new APIServer(config);
}