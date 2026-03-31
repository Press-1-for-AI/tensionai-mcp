/**
 * Budget Constraints - Per-project budget limits and tracking
 * 
 * Provides per-project budget limits (tokens, duration, cost),
 * budget tracking and enforcement, and budget exceeded handling.
 */

import type { TaskMetrics } from "../shared/types.js";

// ============================================================================
// Budget Types
// ============================================================================

export interface ProjectBudget {
  projectId: string;
  maxTokens: number;
  maxDurationMs: number;
  maxCostUsd: number;
  currentTokens: number;
  currentDurationMs: number;
  currentCostUsd: number;
  resetAt?: Date;
}

export interface BudgetConfig {
  maxTokens: number;
  maxDurationMs: number;
  maxCostUsd: number;
  warningThresholdPercent: number; // 0-100
  enforceLimits: boolean;
}

export interface BudgetUsage {
  tokens: number;
  durationMs: number;
  costUsd: number;
}

export type BudgetExceededAction = "reject" | "queue" | "warn";

// ============================================================================
// Budget Manager Class
// ============================================================================

export class BudgetManager {
  private budgets: Map<string, ProjectBudget> = new Map();
  private defaultConfig: BudgetConfig;
  private exceededAction: BudgetExceededAction = "reject";

  constructor(config?: Partial<BudgetConfig>) {
    this.defaultConfig = {
      maxTokens: config?.maxTokens ?? 100000,
      maxDurationMs: config?.maxDurationMs ?? 3600000, // 1 hour
      maxCostUsd: config?.maxCostUsd ?? 10.0,
      warningThresholdPercent: config?.warningThresholdPercent ?? 80,
      enforceLimits: config?.enforceLimits ?? true,
    };
  }

  /**
   * Configure budget for a project
   */
  setProjectBudget(projectId: string, config: Partial<BudgetConfig>): ProjectBudget {
    const budget: ProjectBudget = {
      projectId,
      maxTokens: config.maxTokens ?? this.defaultConfig.maxTokens,
      maxDurationMs: config.maxDurationMs ?? this.defaultConfig.maxDurationMs,
      maxCostUsd: config.maxCostUsd ?? this.defaultConfig.maxCostUsd,
      currentTokens: 0,
      currentDurationMs: 0,
      currentCostUsd: 0,
    };

    this.budgets.set(projectId, budget);
    console.log(`[Budget] Set budget for project ${projectId}:`, {
      maxTokens: budget.maxTokens,
      maxDurationMs: budget.maxDurationMs,
      maxCostUsd: budget.maxCostUsd,
    });

    return budget;
  }

  /**
   * Get budget for a project
   */
  getProjectBudget(projectId: string): ProjectBudget | null {
    return this.budgets.get(projectId) ?? null;
  }

  /**
   * Check if request would exceed budget
   */
  canExecute(projectId: string, estimatedUsage?: Partial<BudgetUsage>): {
    allowed: boolean;
    reason?: string;
    remaining?: BudgetUsage;
    percentUsed?: number;
  } {
    let budget = this.budgets.get(projectId);
    
    // If no budget configured, use default
    if (!budget) {
      budget = {
        projectId,
        maxTokens: this.defaultConfig.maxTokens,
        maxDurationMs: this.defaultConfig.maxDurationMs,
        maxCostUsd: this.defaultConfig.maxCostUsd,
        currentTokens: 0,
        currentDurationMs: 0,
        currentCostUsd: 0,
      };
    }

    // If not enforcing limits, allow
    if (!this.defaultConfig.enforceLimits) {
      return {
        allowed: true,
        remaining: {
          tokens: budget.maxTokens - budget.currentTokens,
          durationMs: budget.maxDurationMs - budget.currentDurationMs,
          costUsd: budget.maxCostUsd - budget.currentCostUsd,
        },
      };
    }

    const estimatedTokens = estimatedUsage?.tokens ?? 0;
    const estimatedDuration = estimatedUsage?.durationMs ?? 0;
    const estimatedCost = estimatedUsage?.costUsd ?? 0;

    // Check if would exceed limits
    if (budget.currentTokens + estimatedTokens > budget.maxTokens) {
      return {
        allowed: false,
        reason: `Token limit exceeded. Current: ${budget.currentTokens}, Max: ${budget.maxTokens}`,
        remaining: {
          tokens: budget.maxTokens - budget.currentTokens,
          durationMs: budget.maxDurationMs - budget.currentDurationMs,
          costUsd: budget.maxCostUsd - budget.currentCostUsd,
        },
      };
    }

    if (budget.currentDurationMs + estimatedDuration > budget.maxDurationMs) {
      return {
        allowed: false,
        reason: `Duration limit exceeded. Current: ${budget.currentDurationMs}ms, Max: ${budget.maxDurationMs}ms`,
        remaining: {
          tokens: budget.maxTokens - budget.currentTokens,
          durationMs: budget.maxDurationMs - budget.currentDurationMs,
          costUsd: budget.maxCostUsd - budget.currentCostUsd,
        },
      };
    }

    if (budget.currentCostUsd + estimatedCost > budget.maxCostUsd) {
      return {
        allowed: false,
        reason: `Cost limit exceeded. Current: $${budget.currentCostUsd.toFixed(2)}, Max: $${budget.maxCostUsd.toFixed(2)}`,
        remaining: {
          tokens: budget.maxTokens - budget.currentTokens,
          durationMs: budget.maxDurationMs - budget.currentDurationMs,
          costUsd: budget.maxCostUsd - budget.currentCostUsd,
        },
      };
    }

    // Calculate percentage used
    const percentUsed = Math.max(
      (budget.currentTokens / budget.maxTokens) * 100,
      (budget.currentDurationMs / budget.maxDurationMs) * 100,
      (budget.currentCostUsd / budget.maxCostUsd) * 100
    );

    return {
      allowed: true,
      remaining: {
        tokens: budget.maxTokens - budget.currentTokens - estimatedTokens,
        durationMs: budget.maxDurationMs - budget.currentDurationMs - estimatedDuration,
        costUsd: budget.maxCostUsd - budget.currentCostUsd - estimatedCost,
      },
      percentUsed,
    };
  }

  /**
   * Record actual usage after task completion
   */
  recordUsage(projectId: string, usage: BudgetUsage): ProjectBudget | null {
    let budget = this.budgets.get(projectId);
    
    if (!budget) {
      // Create default budget if doesn't exist
      budget = {
        projectId,
        maxTokens: this.defaultConfig.maxTokens,
        maxDurationMs: this.defaultConfig.maxDurationMs,
        maxCostUsd: this.defaultConfig.maxCostUsd,
        currentTokens: 0,
        currentDurationMs: 0,
        currentCostUsd: 0,
      };
      this.budgets.set(projectId, budget);
    }

    budget.currentTokens += usage.tokens;
    budget.currentDurationMs += usage.durationMs;
    budget.currentCostUsd += usage.costUsd;

    console.log(`[Budget] Recorded usage for project ${projectId}:`, {
      tokens: usage.tokens,
      durationMs: usage.durationMs,
      costUsd: usage.costUsd,
      totalTokens: budget.currentTokens,
      totalCost: budget.currentCostUsd.toFixed(2),
    });

    // Check if warning threshold exceeded
    const percentUsed = Math.max(
      (budget.currentTokens / budget.maxTokens) * 100,
      (budget.currentDurationMs / budget.maxDurationMs) * 100,
      (budget.currentCostUsd / budget.maxCostUsd) * 100
    );

    if (percentUsed >= this.defaultConfig.warningThresholdPercent) {
      console.warn(`[Budget] WARNING: Project ${projectId} has used ${percentUsed.toFixed(1)}% of budget`);
    }

    return budget;
  }

  /**
   * Record usage from TaskMetrics
   */
  recordTaskMetrics(projectId: string, metrics: TaskMetrics): ProjectBudget | null {
    return this.recordUsage(projectId, {
      tokens: metrics.totalTokensUsed,
      durationMs: metrics.totalDurationMs,
      costUsd: metrics.totalCostUsd,
    });
  }

  /**
   * Reset budget for a project
   */
  resetBudget(projectId: string): void {
    const budget = this.budgets.get(projectId);
    if (budget) {
      budget.currentTokens = 0;
      budget.currentDurationMs = 0;
      budget.currentCostUsd = 0;
      budget.resetAt = new Date();
      console.log(`[Budget] Reset budget for project ${projectId}`);
    }
  }

  /**
   * Reset all budgets
   */
  resetAll(): void {
    for (const budget of this.budgets.values()) {
      budget.currentTokens = 0;
      budget.currentDurationMs = 0;
      budget.currentCostUsd = 0;
      budget.resetAt = new Date();
    }
    console.log("[Budget] All budgets reset");
  }

  /**
   * Get budget status for a project
   */
  getBudgetStatus(projectId: string): {
    configured: boolean;
    limits: { tokens: number; durationMs: number; costUsd: number };
    usage: { tokens: number; durationMs: number; costUsd: number };
    percentUsed: number;
    remaining: { tokens: number; durationMs: number; costUsd: number };
  } | null {
    const budget = this.budgets.get(projectId);
    
    if (!budget) {
      return null;
    }

    const percentUsed = Math.max(
      (budget.currentTokens / budget.maxTokens) * 100,
      (budget.currentDurationMs / budget.maxDurationMs) * 100,
      (budget.currentCostUsd / budget.maxCostUsd) * 100
    );

    return {
      configured: true,
      limits: {
        tokens: budget.maxTokens,
        durationMs: budget.maxDurationMs,
        costUsd: budget.maxCostUsd,
      },
      usage: {
        tokens: budget.currentTokens,
        durationMs: budget.currentDurationMs,
        costUsd: budget.currentCostUsd,
      },
      percentUsed,
      remaining: {
        tokens: budget.maxTokens - budget.currentTokens,
        durationMs: budget.maxDurationMs - budget.currentDurationMs,
        costUsd: budget.maxCostUsd - budget.currentCostUsd,
      },
    };
  }

  /**
   * Get all project budgets
   */
  getAllBudgets(): ProjectBudget[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Set exceeded action
   */
  setExceededAction(action: BudgetExceededAction): void {
    this.exceededAction = action;
    console.log(`[Budget] Set exceeded action to: ${action}`);
  }

  /**
   * Get exceeded action
   */
  getExceededAction(): BudgetExceededAction {
    return this.exceededAction;
  }

  /**
   * Update default config
   */
  updateDefaultConfig(config: Partial<BudgetConfig>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...config,
    };
  }

  /**
   * Get default config
   */
  getDefaultConfig(): BudgetConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Delete project budget
   */
  deleteProjectBudget(projectId: string): boolean {
    const deleted = this.budgets.delete(projectId);
    if (deleted) {
      console.log(`[Budget] Deleted budget for project ${projectId}`);
    }
    return deleted;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let budgetManagerInstance: BudgetManager | null = null;

export function getBudgetManager(config?: Partial<BudgetConfig>): BudgetManager {
  if (!budgetManagerInstance) {
    budgetManagerInstance = new BudgetManager(config);
  }
  return budgetManagerInstance;
}

export function createBudgetManager(config?: Partial<BudgetConfig>): BudgetManager {
  return new BudgetManager(config);
}