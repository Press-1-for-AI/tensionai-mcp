/**
 * CLI Client - Command-line interface for the TensionAI MCP Server
 * 
 * Provides commands for:
 * - Task submission and status checking
 * - Model and team selection
 * - Output formatting
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

interface CLIConfig {
  serverUrl: string;
  apiKey?: string;
  format: "json" | "table" | "simple";
}

const DEFAULT_CONFIG: CLIConfig = {
  serverUrl: process.env.ADVERSARY_SERVER_URL || "http://localhost:3000",
  apiKey: process.env.ADVERSARY_API_KEY,
  format: "table",
};

// ============================================================================
// API Client
// ============================================================================

class APIClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: CLIConfig) {
    this.baseUrl = config.serverUrl;
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<{ status: string; timestamp: string; version: string }> {
    return this.request("/health");
  }

  async getInfo(): Promise<{
    name: string;
    version: string;
    mcpTools: string[];
    capabilities: string[];
    providers: string[];
  }> {
    return this.request("/api/info");
  }

  async createTask(params: {
    prompt: string;
    projectId?: string;
    qualityLevel?: "fast" | "standard" | "deep";
    maxSprints?: number;
    passThreshold?: number;
    provider?: string;
    model?: string;
  }): Promise<{ id: string; status: string; createdAt: string }> {
    return this.request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getTask(taskId: string): Promise<{
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
    sprints?: Array<{
      sprintNumber: number;
      passed: boolean;
      attempts: number;
      durationMs: number;
    }>;
  }> {
    return this.request(`/api/tasks/${taskId}`);
  }

  async listTasks(params?: {
    status?: string;
    limit?: number;
  }): Promise<Array<{ id: string; status: string; createdAt: string }>> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", params.limit.toString());
    return this.request(`/api/tasks?${query}`);
  }

  async abortTask(taskId: string): Promise<{ success: boolean; taskId: string }> {
    return this.request(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
  }

  async getProviders(): Promise<Array<{
    name: string;
    available: boolean;
    models: string[];
  }>> {
    return this.request("/api/providers");
  }

  async getProviderHealth(): Promise<Record<string, {
    available: boolean;
    latencyMs: number | null;
    lastChecked: string;
    error?: string;
  }>> {
    return this.request("/api/providers/health");
  }

  async switchProvider(provider: string, model?: string): Promise<{
    success: boolean;
    defaultProvider: string;
    model?: string;
  }> {
    return this.request("/api/providers/switch", {
      method: "POST",
      body: JSON.stringify({ provider, model }),
    });
  }

  async getMetrics(): Promise<{
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
  }> {
    return this.request("/api/metrics");
  }

  async getTeams(): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    agents: Array<{
      id: string;
      role: string;
      model: string;
      provider: string;
    }>;
  }>> {
    return this.request("/api/teams");
  }

  async getQueueStatus(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    return this.request("/api/queue/status");
  }
}

// ============================================================================
// Formatters
// ============================================================================

class OutputFormatter {
  static json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  static table(data: Record<string, unknown>[]): void {
    if (data.length === 0) {
      console.log("No data");
      return;
    }

    const keys = Object.keys(data[0]);
    const colWidths = keys.map((key) =>
      Math.max(key.length, ...data.map((row) => String(row[key] ?? "").length))
    );

    // Header
    console.log(
      keys.map((key, i) => key.padEnd(colWidths[i])).join(" | ")
    );
    console.log(colWidths.map((w) => "-".repeat(w)).join("-+-"));

    // Rows
    for (const row of data) {
      console.log(
        keys.map((key, i) => String(row[key] ?? "").padEnd(colWidths[i])).join(" | ")
      );
    }
  }

  static simple(data: unknown): void {
    if (typeof data === "object" && data !== null) {
      console.log(
        Object.entries(data)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n")
      );
    } else {
      console.log(data);
    }
  }

  static task(data: {
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
    sprints?: Array<{
      sprintNumber: number;
      passed: boolean;
      attempts: number;
      durationMs: number;
    }>;
  }): void {
    console.log(`\n=== Task ${data.id} ===`);
    console.log(`Status: ${data.status}`);

    if (data.output) console.log(`Output: ${data.output}`);
    if (data.error) console.log(`Error: ${data.error}`);

    console.log("\nMetrics:");
    console.log(`  Duration: ${data.metrics.totalDurationMs}ms`);
    console.log(`  Tokens: ${data.metrics.totalTokensUsed}`);
    console.log(`  Cost: $${data.metrics.totalCostUsd.toFixed(4)}`);
    console.log(`  Sprints: ${data.metrics.sprintsCompleted}`);
    console.log(`  Retries: ${data.metrics.retries}`);

    if (data.sprints && data.sprints.length > 0) {
      console.log("\nSprints:");
      for (const sprint of data.sprints) {
        const status = sprint.passed ? "PASSED" : "FAILED";
        console.log(
          `  Sprint ${sprint.sprintNumber}: ${status} (${sprint.attempts} attempts, ${sprint.durationMs}ms)`
        );
      }
    }
  }
}

// ============================================================================
// Commands
// ============================================================================

async function healthCommand(client: APIClient, _args: string[]): Promise<void> {
  const health = await client.healthCheck();
  OutputFormatter.simple(health);
}

async function infoCommand(client: APIClient, _args: string[]): Promise<void> {
  const info = await client.getInfo();
  OutputFormatter.json(info);
}

async function executeCommand(
  client: APIClient,
  args: string[]
): Promise<void> {
  const prompt = args[0];
  if (!prompt) {
    throw new Error("Prompt is required. Usage: execute <prompt>");
  }

  const params: Parameters<APIClient["createTask"]>[0] = {
    prompt,
  };

  // Parse additional options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--project=")) {
      params.projectId = arg.split("=")[1];
    } else if (arg.startsWith("--quality=")) {
      params.qualityLevel = arg.split("=")[1] as "fast" | "standard" | "deep";
    } else if (arg.startsWith("--sprints=")) {
      params.maxSprints = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--threshold=")) {
      params.passThreshold = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--provider=")) {
      params.provider = arg.split("=")[1];
    } else if (arg.startsWith("--model=")) {
      params.model = arg.split("=")[1];
    }
  }

  const result = await client.createTask(params);
  console.log(`Task created: ${result.id}`);
  console.log(`Status: ${result.status}`);
}

async function statusCommand(
  client: APIClient,
  args: string[]
): Promise<void> {
  const taskId = args[0];
  if (!taskId) {
    throw new Error("Task ID is required. Usage: status <taskId>");
  }

  const task = await client.getTask(taskId);
  OutputFormatter.task(task);
}

async function listCommand(
  client: APIClient,
  args: string[]
): Promise<void> {
  const status = args[0];
  const limit = args[1] ? parseInt(args[1]) : 20;

  const tasks = await client.listTasks({ status, limit });
  OutputFormatter.json(tasks);
}

async function abortCommand(
  client: APIClient,
  args: string[]
): Promise<void> {
  const taskId = args[0];
  if (!taskId) {
    throw new Error("Task ID is required. Usage: abort <taskId>");
  }

  const result = await client.abortTask(taskId);
  if (result.success) {
    console.log(`Task ${taskId} aborted`);
  } else {
    console.log(`Failed to abort task ${taskId}`);
  }
}

async function providersCommand(
  client: APIClient,
  _args: string[]
): Promise<void> {
  const providers = await client.getProviders();
  OutputFormatter.json(providers);
}

async function healthCommand2(
  client: APIClient,
  _args: string[]
): Promise<void> {
  const health = await client.getProviderHealth();
  OutputFormatter.json(health);
}

async function switchProviderCommand(
  client: APIClient,
  args: string[]
): Promise<void> {
  const provider = args[0];
  if (!provider) {
    throw new Error("Provider is required. Usage: switch-provider <provider> [model]");
  }

  const model = args[1];
  const result = await client.switchProvider(provider, model);
  console.log(`Switched to provider: ${result.defaultProvider}`);
  if (result.model) console.log(`Model: ${result.model}`);
}

async function metricsCommand(
  client: APIClient,
  _args: string[]
): Promise<void> {
  const metrics = await client.getMetrics();
  OutputFormatter.simple(metrics);
}

async function teamsCommand(client: APIClient, _args: string[]): Promise<void> {
  const teams = await client.getTeams();
  OutputFormatter.json(teams);
}

async function queueCommand(client: APIClient, _args: string[]): Promise<void> {
  const status = await client.getQueueStatus();
  OutputFormatter.simple(status);
}

// ============================================================================
// Main CLI
// ============================================================================

const COMMANDS: Record<string, (client: APIClient, args: string[]) => Promise<void>> = {
  health: healthCommand,
  info: infoCommand,
  execute: executeCommand,
  status: statusCommand,
  list: listCommand,
  abort: abortCommand,
  providers: providersCommand,
  "provider-health": healthCommand2,
  "switch-provider": switchProviderCommand,
  metrics: metricsCommand,
  teams: teamsCommand,
  queue: queueCommand,
};

function printHelp(): void {
  console.log(`
TensionAI MCP Server CLI

Usage: adversarial <command> [options]

Commands:
  health              Check server health
  info                Get server information
  execute <prompt>   Execute a task
  status <id>        Get task status
  list [status]      List tasks
  abort <id>         Abort a task
  providers           List available providers
  provider-health     Get provider health status
  switch-provider <provider> [model]  Switch default provider
  metrics             Get aggregate metrics
  teams               List team configurations
  queue               Get queue status

Options:
  --project=<id>      Project ID
  --quality=<level>   Quality level (fast, standard, deep)
  --sprints=<n>       Max sprints
  --threshold=<n>     Pass threshold
  --provider=<name>   Provider name
  --model=<name>      Model name

Environment Variables:
  ADVERSARY_SERVER_URL  Server URL (default: http://localhost:3000)
  ADVERSARY_API_KEY    API key for authentication

Examples:
  adversarial execute "Build a REST API"
  adversarial execute "Build a task manager" --quality=deep --sprints=5
  adversarial status task-1234567890
  adversarial list running
  adversarial switch-provider openai gpt-4o
`);
}

export async function main(argv: string[]): Promise<void> {
  const command = argv[2];
  const args = argv.slice(3);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  try {
    const client = new APIClient(DEFAULT_CONFIG);
    await handler(client, args);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run if called directly
main(process.argv).catch(console.error);
