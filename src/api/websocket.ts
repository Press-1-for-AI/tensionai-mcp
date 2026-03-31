/**
 * WebSocket Handler for real-time debate streaming and task events
 * 
 * Implements WebSocket server for:
 * - Real-time task events (task.started, task.progress, task.debate, etc.)
 * - Queue status updates
 * - Metrics updates
 * - Heartbeat ping/pong every 30 seconds
 */

import type { FastifyInstance } from "fastify";
import type { TaskResult } from "../shared/types.js";

// ============================================================================
// WebSocket Event Types
// ============================================================================

export interface WSPingEvent {
  type: "ws.ping";
  timestamp: string;
}

export interface WSPongEvent {
  type: "ws.pong";
  timestamp: string;
}

export interface WSConnectedEvent {
  type: "ws.connected";
  sessionId: string;
  timestamp: string;
}

export interface WSDisconnectedEvent {
  type: "ws.disconnected";
  sessionId: string;
  timestamp: string;
}

export interface TaskStartedEvent {
  type: "task.started";
  taskId: string;
  prompt: string;
  qualityLevel: string;
  timestamp: string;
}

export interface TaskProgressEvent {
  type: "task.progress";
  taskId: string;
  sprintNumber: number;
  status: string;
  message: string;
  timestamp: string;
}

export interface TaskDebateEvent {
  type: "task.debate";
  taskId: string;
  round: number;
  agent: string;
  agentId?: string;
  content: string;
  timestamp: string;
}

export interface TaskCompletedEvent {
  type: "task.completed";
  taskId: string;
  output: string;
  metrics: {
    totalDurationMs: number;
    totalTokensUsed: number;
    totalCostUsd: number;
    sprintsCompleted: number;
  };
  timestamp: string;
}

export interface TaskFailedEvent {
  type: "task.failed";
  taskId: string;
  error: string;
  timestamp: string;
}

export interface QueueUpdatedEvent {
  type: "queue.updated";
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  timestamp: string;
}

export interface MetricsUpdatedEvent {
  type: "metrics.updated";
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatencyMs: number;
  timestamp: string;
}

export interface TiebreakerRequestEvent {
  type: "tiebreaker.request";
  taskId: string;
  reason: string;
  options: string[];
  timestamp: string;
}

export type WSEvent = 
  | WSPingEvent 
  | WSPongEvent 
  | WSConnectedEvent 
  | WSDisconnectedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskDebateEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | QueueUpdatedEvent
  | MetricsUpdatedEvent
  | TiebreakerRequestEvent;

// ============================================================================
// WebSocket Client Management
// ============================================================================

interface WSClient {
  id: string;
  socket: any; // WebSocket
  subscribedTasks: Set<string>;
  lastPing: number;
}

// ============================================================================
// WebSocket Handler Class
// ============================================================================

export class WebSocketHandler {
  private app: FastifyInstance;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30000;
  private readonly HEARTBEAT_TIMEOUT_MS = 60000;

  constructor(app: FastifyInstance) {
    this.app = app;
    this.startHeartbeat();
  }

  /**
   * Register a new WebSocket client
   */
  registerClient(clientId: string, socket: any): void {
    this.clients.set(clientId, {
      id: clientId,
      socket,
      subscribedTasks: new Set(),
      lastPing: Date.now(),
    });

    // Send connection confirmation
    this.sendToClient(clientId, {
      type: "ws.connected",
      sessionId: clientId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a WebSocket client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.sendToClient(clientId, {
        type: "ws.disconnected",
        sessionId: clientId,
        timestamp: new Date().toISOString(),
      });
      this.clients.delete(clientId);
    }
  }

  /**
   * Subscribe client to task updates
   */
  subscribeToTask(clientId: string, taskId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscribedTasks.add(taskId);
    }
  }

  /**
   * Unsubscribe client from task updates
   */
  unsubscribeFromTask(clientId: string, taskId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscribedTasks.delete(taskId);
    }
  }

  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: WSEvent): void {
    const client = this.clients.get(clientId);
    if (client && client.socket) {
      try {
        client.socket.send(JSON.stringify(event));
      } catch (error) {
        console.error(`[WS] Failed to send to client ${clientId}:`, error);
      }
    }
  }

  /**
   * Broadcast event to all subscribed clients for a task
   */
  broadcastToTaskSubscribers(taskId: string, event: WSEvent): void {
    for (const [, client] of this.clients) {
      if (client.subscribedTasks.has(taskId)) {
        this.sendToClient(client.id, event);
      }
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcastToAll(event: WSEvent): void {
    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, event);
    }
  }

  /**
   * Handle pong response from client (heartbeat)
   */
  handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  /**
   * Emit task started event
   */
  emitTaskStarted(taskId: string, prompt: string, qualityLevel: string): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "task.started",
      taskId,
      prompt,
      qualityLevel,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit task progress event
   */
  emitTaskProgress(taskId: string, sprintNumber: number, status: string, message: string): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "task.progress",
      taskId,
      sprintNumber,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit task debate event
   */
  emitTaskDebate(taskId: string, round: number, agent: string, agentId: string | undefined, content: string): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "task.debate",
      taskId,
      round,
      agent,
      agentId,
      content,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit task completed event
   */
  emitTaskCompleted(taskId: string, output: string, metrics: TaskResult["metrics"]): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "task.completed",
      taskId,
      output,
      metrics,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit task failed event
   */
  emitTaskFailed(taskId: string, error: string): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "task.failed",
      taskId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit queue updated event
   */
  emitQueueUpdated(queued: number, processing: number, completed: number, failed: number): void {
    this.broadcastToAll({
      type: "queue.updated",
      queued,
      processing,
      completed,
      failed,
      total: queued + processing + completed + failed,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit metrics updated event
   */
  emitMetricsUpdated(totalRequests: number, totalTokens: number, totalCost: number, averageLatencyMs: number): void {
    this.broadcastToAll({
      type: "metrics.updated",
      totalRequests,
      totalTokens,
      totalCost,
      averageLatencyMs,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit tiebreaker request event (human intervention needed)
   */
  emitTiebreakerRequest(taskId: string, reason: string, options: string[]): void {
    this.broadcastToTaskSubscribers(taskId, {
      type: "tiebreaker.request",
      taskId,
      reason,
      options,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start heartbeat to ping all clients every 30 seconds
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [clientId, client] of this.clients) {
        // Check if client hasn't responded to last ping
        if (now - client.lastPing > this.HEARTBEAT_TIMEOUT_MS) {
          console.log(`[WS] Client ${clientId} timed out, removing`);
          this.removeClient(clientId);
          continue;
        }

        // Send ping
        this.sendToClient(clientId, {
          type: "ws.ping",
          timestamp: new Date().toISOString(),
        });
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get active subscriptions count
   */
  getActiveSubscriptions(): number {
    let count = 0;
    for (const [, client] of this.clients) {
      count += client.subscribedTasks.size;
    }
    return count;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let wsHandlerInstance: WebSocketHandler | null = null;

export function getWebSocketHandler(app?: FastifyInstance): WebSocketHandler {
  if (!wsHandlerInstance && app) {
    wsHandlerInstance = new WebSocketHandler(app);
  }
  return wsHandlerInstance!;
}

export function setWebSocketHandler(handler: WebSocketHandler): void {
  wsHandlerInstance = handler;
}