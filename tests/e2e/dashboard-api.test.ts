/**
 * E2E Test Suite - Dashboard API
 * 
 * Tests dashboard and monitoring functionality:
 * 1. Get dashboard summary
 * 2. Get queue status
 * 3. Get metrics
 */

import { describe, test, expect } from "bun:test";

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";

describe("Dashboard API", () => {
  test("should get dashboard summary", async () => {
    const response = await fetch(`${SERVER_URL}/api/dashboard/summary`);
    expect(response.status).toBe(200);
    
    const summary = await response.json();
    expect(summary).toBeDefined();
    expect(summary.activeTasks).toBeDefined();
    expect(summary.queuedTasks).toBeDefined();
    expect(summary.averageLatencyMs).toBeDefined();
    expect(summary.providerHealth).toBeDefined();
  });

  test("should get queue status", async () => {
    const response = await fetch(`${SERVER_URL}/api/queue/status`);
    expect(response.status).toBe(200);
    
    const status = await response.json();
    expect(status.queued).toBeDefined();
    expect(status.processing).toBeDefined();
    expect(status.completed).toBeDefined();
    expect(status.failed).toBeDefined();
    expect(status.total).toBeDefined();
  });

  test("should get queue config", async () => {
    const response = await fetch(`${SERVER_URL}/api/queue/config`);
    expect(response.status).toBe(200);
    
    const config = await response.json();
    expect(config.maxConcurrentPerProject).toBeDefined();
    expect(config.maxQueueSizePerProject).toBeDefined();
    expect(config.defaultPriority).toBeDefined();
    expect(config.processingTimeoutMs).toBeDefined();
  });

  test("should get aggregate metrics", async () => {
    const response = await fetch(`${SERVER_URL}/api/metrics`);
    expect(response.status).toBe(200);
    
    const metrics = await response.json();
    expect(metrics.totalRequests).toBeDefined();
    expect(metrics.tokens).toBeDefined();
    expect(metrics.cost).toBeDefined();
    expect(metrics.averageDurationMs).toBeDefined();
  });

  test("should get metrics by provider", async () => {
    const response = await fetch(`${SERVER_URL}/api/metrics/by-provider`);
    expect(response.status).toBe(200);
    
    const metrics = await response.json();
    expect(typeof metrics).toBe("object");
  });

  test("should get request history", async () => {
    const response = await fetch(`${SERVER_URL}/api/metrics/history?limit=10`);
    expect(response.status).toBe(200);
    
    const history = await response.json();
    expect(Array.isArray(history)).toBe(true);
  });

  test("should reset metrics", async () => {
    const response = await fetch(`${SERVER_URL}/api/metrics/reset`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test("should get alerts", async () => {
    const response = await fetch(`${SERVER_URL}/api/alerts`);
    expect(response.status).toBe(200);
    
    const alerts = await response.json();
    expect(Array.isArray(alerts)).toBe(true);
  });

  test("should get alert stats", async () => {
    const response = await fetch(`${SERVER_URL}/api/alerts/stats`);
    expect(response.status).toBe(200);
    
    const stats = await response.json();
    expect(stats.total).toBeDefined();
    expect(stats.active).toBeDefined();
    expect(stats.byType).toBeDefined();
    expect(stats.bySeverity).toBeDefined();
  });

  test("should get alert config", async () => {
    const response = await fetch(`${SERVER_URL}/api/alerts/config`);
    expect(response.status).toBe(200);
    
    const config = await response.json();
    expect(config).toBeDefined();
  });

  test("should get server info", async () => {
    const response = await fetch(`${SERVER_URL}/api/info`);
    expect(response.status).toBe(200);
    
    const info = await response.json();
    expect(info.name).toBe("TensionAI Multi-Agent MCP Server");
    expect(info.version).toBeDefined();
    expect(info.mcpTools).toBeDefined();
    expect(info.capabilities).toBeDefined();
    expect(info.providers).toBeDefined();
  });

  test("should check health", async () => {
    const response = await fetch(`${SERVER_URL}/health`);
    expect(response.status).toBe(200);
    
    const health = await response.json();
    expect(health.status).toBe("healthy");
    expect(health.version).toBeDefined();
  });
});
