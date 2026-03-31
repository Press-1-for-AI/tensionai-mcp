/**
 * E2E Test Suite - Multi-Provider Fallback
 * 
 * Tests provider fallback functionality:
 * 1. Switch provider
 * 2. Verify fallback chain
 * 3. Test health checks
 */

import { describe, test, expect, beforeAll } from "bun:test";

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";

describe("Multi-Provider Fallback", () => {
  test("should list available providers", async () => {
    const response = await fetch(`${SERVER_URL}/api/providers`);
    expect(response.status).toBe(200);
    
    const providers = await response.json();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
    
    // Each provider should have name, available, models
    for (const provider of providers) {
      expect(provider.name).toBeDefined();
      expect(provider.available).toBeDefined();
      expect(Array.isArray(provider.models)).toBe(true);
    }
  });

  test("should get provider health status", async () => {
    const response = await fetch(`${SERVER_URL}/api/providers/health`);
    expect(response.status).toBe(200);
    
    const health = await response.json();
    expect(health.providers).toBeDefined();
    
    // Check each provider's health
    for (const [name, status] of Object.entries(health.providers)) {
      expect(status.available).toBeDefined();
      expect(status.latencyMs).toBeDefined();
      expect(status.lastChecked).toBeDefined();
    }
  });

  test("should force health check", async () => {
    const response = await fetch(`${SERVER_URL}/api/providers/health/check`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    
    const health = await response.json();
    expect(health.providers).toBeDefined();
  });

  test("should get available models", async () => {
    const response = await fetch(`${SERVER_URL}/api/providers/models`);
    expect(response.status).toBe(200);
    
    const models = await response.json();
    expect(typeof models).toBe("object");
    
    // Each provider should have an array of models
    for (const [provider, modelList] of Object.entries(models)) {
      expect(Array.isArray(modelList)).toBe(true);
    }
  });

  test("should switch default provider", async () => {
    // First, get available providers
    const providersRes = await fetch(`${SERVER_URL}/api/providers`);
    const providers = await providersRes.json();
    
    if (providers.length > 1) {
      const newProvider = providers[1].name;
      
      const response = await fetch(`${SERVER_URL}/api/providers/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: newProvider,
        }),
      });
      
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.defaultProvider).toBe(newProvider);
    }
  });

  test("should set fallback chain", async () => {
    const response = await fetch(`${SERVER_URL}/api/providers/fallback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: ["openai", "anthropic", "minimax"],
      }),
    });
    
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.fallbackChain).toEqual(["openai", "anthropic", "minimax"]);
  });
});
