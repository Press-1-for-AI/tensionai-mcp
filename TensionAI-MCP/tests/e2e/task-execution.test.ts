/**
 * E2E Test Suite - Basic Task Execution Flow
 * 
 * Tests the core task execution flow:
 * 1. Create a task
 * 2. Monitor status
 * 3. Verify completion
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";

interface TaskResponse {
  id: string;
  status: string;
  createdAt: string;
}

interface TaskDetail {
  id: string;
  status: string;
  output?: string;
  error?: string;
  metrics: {
    totalDurationMs: number;
    totalTokensUsed: number;
    totalCostUsd: number;
    sprintsCompleted: number;
    retries: number;
  };
}

describe("Basic Task Execution Flow", () => {
  let taskId: string;

  afterAll(async () => {
    // Clean up: abort any running tasks
    if (taskId) {
      try {
        await fetch(`${SERVER_URL}/api/tasks/${taskId}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test("should create a task successfully", async () => {
    const response = await fetch(`${SERVER_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Write a simple hello world function",
        qualityLevel: "fast",
        maxSprints: 1,
      }),
    });

    expect(response.status).toBe(200);
    const data: TaskResponse = await response.json();
    
    expect(data.id).toBeDefined();
    expect(data.status).toBe("running");
    
    taskId = data.id;
  });

  test("should get task status", async () => {
    // Wait a bit for task to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = await fetch(`${SERVER_URL}/api/tasks/${taskId}`);
    expect(response.status).toBe(200);
    
    const data: TaskDetail = await response.json();
    expect(data.id).toBe(taskId);
    expect(data.status).toBeDefined();
    expect(["pending", "running", "completed", "failed"].includes(data.status)).toBe(true);
  });

  test("should list tasks", async () => {
    const response = await fetch(`${SERVER_URL}/api/tasks?limit=10`);
    expect(response.status).toBe(200);
    
    const data: TaskResponse[] = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("should filter tasks by status", async () => {
    const response = await fetch(`${SERVER_URL}/api/tasks?status=running`);
    expect(response.status).toBe(200);
    
    const data: TaskResponse[] = await response.json();
    expect(Array.isArray(data)).toBe(true);
    
    // All returned tasks should have running status
    for (const task of data) {
      expect(task.status).toBe("running");
    }
  });
});
