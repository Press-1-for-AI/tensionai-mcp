/**
 * E2E Test Suite - Team Configuration
 * 
 * Tests team management functionality:
 * 1. List team presets
 * 2. Create custom team
 * 3. Get team recommendations
 */

import { describe, test, expect } from "bun:test";

const SERVER_URL = process.env.ADVERSARY_SERVER_URL || "http://localhost:3000";
const TEST_TEAM_ID = `test-team-${Date.now()}`;

describe("Team Configuration", () => {
  test("should list team presets", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/presets`);
    expect(response.status).toBe(200);
    
    const presets = await response.json();
    expect(Array.isArray(presets)).toBe(true);
    
    // Should have fast, balanced, thorough presets
    const presetNames = presets.map((p: any) => p.name);
    expect(presetNames).toContain("fast");
    expect(presetNames).toContain("balanced");
    expect(presetNames).toContain("thorough");
  });

  test("should get specific preset config", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/presets/balanced`);
    expect(response.status).toBe(200);
    
    const preset = await response.json();
    expect(preset).toBeDefined();
    expect(preset.name).toBe("balanced");
  });

  test("should list all teams", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams`);
    expect(response.status).toBe(200);
    
    const teams = await response.json();
    expect(Array.isArray(teams)).toBe(true);
  });

  test("should create a new team", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Custom Test Team",
        description: "E2E test team",
        minAgents: 2,
        maxAgents: 4,
        agents: [
          {
            role: "planner",
            model: "claude-sonnet-3-5-20250219",
            provider: "anthropic",
            maxRetries: 3,
          },
          {
            role: "generator",
            model: "claude-sonnet-3-5-20250219",
            provider: "anthropic",
            maxRetries: 3,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const team = await response.json();
    expect(team).toBeDefined();
    expect(team.name).toBe("Custom Test Team");
  });

  test("should get team by ID", async () => {
    // First create a team to get its ID
    const createRes = await fetch(`${SERVER_URL}/api/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Get Test Team",
        description: "Team for get test",
      }),
    });
    
    const team = await createRes.json();
    
    const response = await fetch(`${SERVER_URL}/api/teams/${team.id}`);
    expect(response.status).toBe(200);
    
    const retrieved = await response.json();
    expect(retrieved.id).toBe(team.id);
    expect(retrieved.name).toBe("Get Test Team");
  });

  test("should auto-assign team based on prompt", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/autoassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Build a REST API with authentication",
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.teamId).toBeDefined();
  });

  test("should detect task type", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Create a simple web scraper",
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.taskType).toBeDefined();
  });

  test("should get team recommendations", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Build an e-commerce platform",
        preferredSpeed: "balanced",
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toBeDefined();
    expect(result.primary).toBeDefined();
    expect(result.alternatives).toBeDefined();
  });

  test("should set user override", async () => {
    const response = await fetch(`${SERVER_URL}/api/teams/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "test-user",
        teamId: "default-balanced",
        projectId: "test-project",
        taskType: "web-app",
      }),
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toBeDefined();
  });
});
