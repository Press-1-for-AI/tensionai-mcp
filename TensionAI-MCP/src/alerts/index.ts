/**
 * Alert System - Provider health alerts, budget threshold alerts, and notification system
 * 
 * Provides provider health alerts, budget threshold alerts,
 * and configurable alert notification system.
 */

import type { ProviderName } from "../shared/types.js";
import { getHealthMonitor, type ProviderHealthStatus } from "../providers/health.js";

// ============================================================================
// Alert Types
// ============================================================================

export type AlertType = "provider_down" | "provider_recovered" | "budget_threshold" | "rate_limit_exceeded" | "service_unavailable";
export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  source: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export interface AlertConfig {
  enabled: boolean;
  budgetWarningPercent: number;
  budgetCriticalPercent: number;
  providerCheckIntervalMs: number;
  maxAlerts: number;
  alertHistorySize: number;
}

export interface AlertNotificationHandler {
  (alert: Alert): Promise<void> | void;
}

// ============================================================================
// Alert Manager Class
// ============================================================================

export class AlertManager {
  private alerts: Alert[] = [];
  private config: AlertConfig;
  private handlers: AlertNotificationHandler[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private previousHealthStatus: Map<ProviderName, boolean> = new Map();
  private isRunning: boolean = false;

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      budgetWarningPercent: config?.budgetWarningPercent ?? 80,
      budgetCriticalPercent: config?.budgetCriticalPercent ?? 95,
      providerCheckIntervalMs: config?.providerCheckIntervalMs ?? 60000,
      maxAlerts: config?.maxAlerts ?? 1000,
      alertHistorySize: config?.alertHistorySize ?? 500,
    };
  }

  /**
   * Create and emit an alert
   */
  emit(type: AlertType, severity: AlertSeverity, message: string, source: string, metadata?: Record<string, unknown>): Alert {
    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      message,
      source,
      timestamp: new Date(),
      metadata,
      acknowledged: false,
    };

    // Add to alerts list
    this.alerts.unshift(alert);

    // Trim old alerts
    if (this.alerts.length > this.config.alertHistorySize) {
      this.alerts = this.alerts.slice(0, this.config.alertHistorySize);
    }

    console.log(`[Alerts] ${severity.toUpperCase()}: ${message}`);

    // Notify handlers
    this.notifyHandlers(alert);

    return alert;
  }

  /**
   * Check provider health and emit alerts
   */
  async checkProviders(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const healthMonitor = getHealthMonitor();
      const statuses = await healthMonitor.checkAllProviders();

      for (const [providerName, status] of Object.entries(statuses)) {
        const wasAvailable = this.previousHealthStatus.get(providerName as ProviderName);
        const isAvailable = status.available;

        // Provider went down
        if (wasAvailable === true && !isAvailable) {
          this.emit(
            "provider_down",
            "error",
            `Provider ${providerName} is now unavailable: ${status.error ?? "Unknown error"}`,
            `health-monitor`,
            { provider: providerName, status }
          );
        }

        // Provider recovered
        if (wasAvailable === false && isAvailable) {
          this.emit(
            "provider_recovered",
            "info",
            `Provider ${providerName} has recovered (latency: ${status.latencyMs}ms)`,
            `health-monitor`,
            { provider: providerName, status }
          );
        }

        // Update previous status
        this.previousHealthStatus.set(providerName as ProviderName, isAvailable);
      }
    } catch (error) {
      console.error("[Alerts] Error checking provider health:", error);
    }
  }

  /**
   * Check budget and emit alerts if threshold exceeded
   */
  checkBudget(projectId: string, percentUsed: number): void {
    if (!this.config.enabled) return;

    if (percentUsed >= this.config.budgetCriticalPercent) {
      this.emit(
        "budget_threshold",
        "critical",
        `Project ${projectId} has used ${percentUsed.toFixed(1)}% of budget (critical threshold: ${this.config.budgetCriticalPercent}%)`,
        `budget-manager`,
        { projectId, percentUsed, threshold: this.config.budgetCriticalPercent }
      );
    } else if (percentUsed >= this.config.budgetWarningPercent) {
      this.emit(
        "budget_threshold",
        "warning",
        `Project ${projectId} has used ${percentUsed.toFixed(1)}% of budget (warning threshold: ${this.config.budgetWarningPercent}%)`,
        `budget-manager`,
        { projectId, percentUsed, threshold: this.config.budgetWarningPercent }
      );
    }
  }

  /**
   * Emit rate limit exceeded alert
   */
  emitRateLimitExceeded(apiKey: string, projectId?: string): void {
    const maskedKey = apiKey.length > 8 
      ? apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length - 4)
      : "****";

    this.emit(
      "rate_limit_exceeded",
      "warning",
      `Rate limit exceeded for API key ${maskedKey}${projectId ? ` (project: ${projectId})` : ""}`,
      `rate-limiter`,
      { projectId }
    );
  }

  /**
   * Emit service unavailable alert
   */
  emitServiceUnavailable(service: string, reason: string): void {
    this.emit(
      "service_unavailable",
      "critical",
      `Service ${service} is unavailable: ${reason}`,
      `system`,
      { service, reason }
    );
  }

  /**
   * Get active (unresolved) alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolvedAt);
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(type: AlertType): Alert[] {
    return this.alerts.filter(a => a.type === type);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.alerts.filter(a => a.severity === severity);
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(count: number = 50): Alert[] {
    return this.alerts.slice(0, count);
  }

  /**
   * Acknowledge an alert
   */
  acknowledge(alertId: string): Alert | null {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      console.log(`[Alerts] Alert ${alertId} acknowledged`);
      return alert;
    }
    return null;
  }

  /**
   * Resolve an alert
   */
  resolve(alertId: string): Alert | null {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      console.log(`[Alerts] Alert ${alertId} resolved`);
      return alert;
    }
    return null;
  }

  /**
   * Add notification handler
   */
  addHandler(handler: AlertNotificationHandler): void {
    this.handlers.push(handler);
    console.log(`[Alerts] Added notification handler (total: ${this.handlers.length})`);
  }

  /**
   * Remove notification handler
   */
  removeHandler(handler: AlertNotificationHandler): boolean {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Notify all handlers
   */
  private async notifyHandlers(alert: Alert): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(alert);
      } catch (error) {
        console.error("[Alerts] Handler error:", error);
      }
    }
  }

  /**
   * Start automatic provider health monitoring
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) return;
    
    this.isRunning = true;
    
    // Run initial check
    this.checkProviders().catch(error => {
      console.error("[Alerts] Initial provider check failed:", error);
    });

    // Schedule periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.checkProviders().catch(error => {
        console.error("[Alerts] Periodic provider check failed:", error);
      });
    }, this.config.providerCheckIntervalMs);

    console.log(`[Alerts] Started with provider check interval ${this.config.providerCheckIntervalMs}ms`);
  }

  /**
   * Stop automatic monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.isRunning = false;
    console.log("[Alerts] Stopped");
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    if (this.config.enabled && wasRunning) {
      this.start();
    }
  }

  /**
   * Get configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }

  /**
   * Clear all alerts
   */
  clear(): void {
    this.alerts = [];
    console.log("[Alerts] Cleared all alerts");
  }

  /**
   * Get alert statistics
   */
  getStats(): {
    total: number;
    active: number;
    byType: Record<AlertType, number>;
    bySeverity: Record<AlertSeverity, number>;
    acknowledged: number;
  } {
    const active = this.alerts.filter(a => !a.resolvedAt);
    const byType: Record<AlertType, number> = {
      provider_down: 0,
      provider_recovered: 0,
      budget_threshold: 0,
      rate_limit_exceeded: 0,
      service_unavailable: 0,
    };
    const bySeverity: Record<AlertSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    for (const alert of this.alerts) {
      byType[alert.type]++;
      bySeverity[alert.severity]++;
    }

    return {
      total: this.alerts.length,
      active: active.length,
      byType,
      bySeverity,
      acknowledged: this.alerts.filter(a => a.acknowledged).length,
    };
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Console Handler (Default)
// ============================================================================

function consoleHandler(alert: Alert): void {
  let icon = "🔵";
  if (alert.severity === "critical") {
    icon = "🔴";
  } else if (alert.severity === "error") {
    icon = "🔴";
  } else if (alert.severity === "warning") {
    icon = "🟡";
  }
  
  console.log(`${icon} [${alert.severity.toUpperCase()}] ${alert.message}`);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let alertManagerInstance: AlertManager | null = null;

export function getAlertManager(config?: Partial<AlertConfig>): AlertManager {
  if (!alertManagerInstance) {
    alertManagerInstance = new AlertManager(config);
    alertManagerInstance.addHandler(consoleHandler);
  }
  return alertManagerInstance;
}

export function createAlertManager(config?: Partial<AlertConfig>): AlertManager {
  const manager = new AlertManager(config);
  manager.addHandler(consoleHandler);
  return manager;
}

// Re-export types
export type { ProviderHealthStatus } from "../providers/health.js";