/**
 * E2E Test Suite - Memory Persistence
 * 
 * Tests memory service functionality:
 * 1. Write to memory
 * 2. Search memory
 * 3. Verify persistence
 */

import { describe, test, expect } from "bun:test";

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";
const TEST_PROJECT_ID = `test-${Date.now()}`;

describe("Memory Persistence", () => {
  test("should write to project memory", async () => {
    const response = await fetch(`${SERVER_URL}/api/memory/${TEST_PROJECT_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "This is a test memory entry for E2E testing",
        metadata: { type: "test", version: "1.0" },
        memoryType: "general",
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry.id).toBeDefined();
  });

  test("should read project memory", async () => {
    // Wait a bit for memory to be written
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = await fetch(`${SERVER_URL}/api/memory/${TEST_PROJECT_ID}?limit=10`);
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.projectId).toBe(TEST_PROJECT_ID);
    expect(result.entries).toBeDefined();
    expect(Array.isArray(result.entries)).toBe(true);
  });

  test("should search project memory", async () => {
    const response = await fetch(
      `${SERVER_URL}/api/memory/${TEST_PROJECT_ID}/search?q=test&limit=10&threshold=0.5`
    );
    expect(response.status).toBe(200);
    
    const result = await response.json();
    expect(result.projectId).toBe(TEST_PROJECT_ID);
    expect(result.query).toBe("test");
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  test("should get memory stats", async () => {
    const response = await fetch(`${SERVER_URL}/api/memory/${TEST_PROJECT_ID}/stats`);
    expect(response.status).toBe(200);
    
    const stats = await response.json();
    expect(stats.projectId).toBeDefined();
    expect(stats.totalEntries).toBeDefined();
    expect(stats.byType).toBeDefined();
  });

  test("should get memory config", async () => {
    const response = await fetch(`${SERVER_URL}/api/memory/config`);
    expect(response.status).toBe(200);
    
    const config = await response.json();
    expect(config).toBeDefined();
  });

  test("should update memory config", async () => {
    const response = await fetch(`${SERVER_URL}/api/memory/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        similarityThreshold: 0.8,
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test("should purge project memory", async () => {
    const response = await fetch(`${SERVER_URL}/api/memory/${TEST_PROJECT_ID}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBeDefined();
  });
});
