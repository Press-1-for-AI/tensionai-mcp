/**
 * Shared type definitions for the TensionAI MCP Server
 */

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "aborted";
export type QualityLevel = "fast" | "standard" | "deep";
export type AgentRole = "planner" | "generator" | "evaluator";

export interface TaskRequest {
  id: string;
  prompt: string;
  projectId: string;
  qualityLevel: QualityLevel;
  maxSprints: number;
  maxRetriesPerSprint: number;
  passThreshold: number;
  createdAt: Date;
}

export interface TaskResult {
  id: string;
  status: TaskStatus;
  output?: string;
  error?: string;
  metrics: TaskMetrics;
  sprints?: SprintResult[];
}

export interface TaskMetrics {
  totalDurationMs: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  sprintsCompleted: number;
  retries: number;
}

// ============================================================================
// Sprint Types
// ============================================================================

export interface SprintContract {
  sprintNumber: number;
  features: string[];
  criteria: SprintCriterion[];
}

export interface SprintCriterion {
  name: string;
  description: string;
  threshold: number;
}

export interface SprintResult {
  sprintNumber: number;
  passed: boolean;
  attempts: number;
  tokensUsed?: number;
  evalResult?: EvalResult;
  durationMs: number;
}

// ============================================================================
// Evaluation Types
// ============================================================================

export interface EvalScore {
  criterion: string;
  score: number;
  details: string;
}

export interface EvalResult {
  passed: boolean;
  scores: Record<string, number>;
  feedback: EvalScore[];
  overallSummary: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentConfig {
  role: AgentRole;
  model: string;
  provider: string;
  maxRetries: number;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentResult {
  role: AgentRole;
  output: string;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export type ProviderName = "openai" | "anthropic" | "minimax" | "gemini" | "local-vllm" | "local-llama";

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  provider: string;
}

export interface LLMProvider {
  name: string;
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown>;
  isAvailable(): Promise<boolean>;
  getModels(): string[];
}

// ============================================================================
// MCP Tool Types
// ============================================================================

export interface ExecuteTaskParams {
  prompt: string;
  projectId?: string;
  qualityLevel?: QualityLevel;
  maxSprints?: number;
  passThreshold?: number;
}

export interface AbortTaskParams {
  taskId: string;
}

export interface GetStatusParams {
  taskId: string;
}

export interface GetTaskResult {
  id: string;
  status: TaskStatus;
  output?: string;
  error?: string;
  metrics: TaskMetrics;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: "development" | "production";
}

export interface BudgetConstraint {
  maxTokens?: number;
  maxDurationMs?: number;
  maxCostUsd?: number;
}

// ============================================================================
// File-based Communication Types
// ============================================================================

export interface AgentCommunicationFile {
  taskId: string;
  round: number;
  sender: AgentRole;
  content: string;
  timestamp: string;
}

export interface DebateRecord {
  taskId: string;
  rounds: DebateRound[];
}

export interface DebateRound {
  roundNumber: number;
  messages: AgentMessage[];
  evalResult?: EvalResult;
  timestamp: string;
}

// ============================================================================
// Team Types
// ============================================================================

export type TaskType = "coding" | "writing" | "research" | "analysis" | "general";

export type PresetTemplate = "fast" | "balanced" | "thorough" | "custom";

export interface TeamAgent {
  id: string;
  role: AgentRole;
  model: string;
  provider: string;
  maxRetries: number;
}

export interface TeamConfig {
  id: string;
  name: string;
  description?: string;
  agents: TeamAgent[];
  minAgents: number;
  maxAgents: number;
  createdAt: Date;
  updatedAt: Date;
  isPreset: boolean;
}

export interface TeamPreset {
  name: PresetTemplate;
  description: string;
  agentCount: number;
  agents: TeamAgent[];
}

export interface AutoAssignResult {
  teamId: string;
  teamName: string;
  taskType: TaskType;
  confidence: number;
  reasoning: string;
}

export interface UserOverride {
  id: string;
  userId: string;
  projectId?: string;
  teamId: string;
  taskType?: TaskType;
  createdAt: Date;
  expiresAt?: Date;
}