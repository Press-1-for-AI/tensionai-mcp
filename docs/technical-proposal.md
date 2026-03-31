# TensionAI Multi-Agent MCP Server
## Technical Proposal v1.1

---

## 1. Executive Summary

This document defines a comprehensive technical architecture for building an **TensionAI Multi-Agent MCP Server** — a production-grade system that extends the adversarial harness pattern (from the existing `tensionai-dev` project) into a full-featured MCP server with multi-model support, real-time dashboard, and sophisticated resource management.

The core insight remains: **separate generation from evaluation, then pit them against each other**. This architecture scales that principle into a flexible, production-ready system capable of handling diverse task types with configurable agent teams and robust resource controls.

---

## 2. System Overview

### 2.1 High-Level Architecture

The system consists of four primary components:

| Component | Responsibility |
|-----------|---------------|
| **MCP Server** | Handles MCP protocol communication, tool definitions, and request routing |
| **Agent Orchestrator** | Manages lifecycle of adversarial agent teams (Planner/Generator/Evaluator/Tie-Breaker) |
| **Dashboard API** | Provides real-time metrics, configuration, and control endpoints |
| **Memory Service** | Manages project-isolated memory with configurable backends |

### 2.2 Data Flow

```mermaid
flowchart LR
    subgraph External
        IDE[IDE Chat<br/>Roo Code/Cursor]
        CLI[CLI Client]
        WEB[Web UI<br/>OpenWebUI]
    end
    
    subgraph MCP_Server
        MCP[MCP Protocol<br/>Handler]
        Auth[Auth & Rate<br/>Limit]
    end
    
    subgraph Orchestrator
        Queue[Request<br/>Queue]
        Router[Task<br/>Router]
        Teams[Agent<br/>Teams]
    end
    
    subgraph Agents
        Planner[Planner<br/>Agent]
        Generator[Generator<br/>Agent]
        Evaluator[Evaluator<br/>Agent]
        Human[Tie-Breaker<br/>Human]
    end
    
    subgraph Resources
        LLM[LLM Pool<br/>Multi-Provider]
        Mem[Memory<br/>Service]
        DB[(PostgreSQL<br/>SQLite)]
    end
    
    IDE --> MCP
    CLI --> MCP
    WEB --> MCP
    MCP --> Auth
    Auth --> Queue
    Queue --> Router
    Router --> Teams
    Teams --> Planner
    Teams --> Generator
    Teams --> Evaluator
    Teams --> Human
    Planner --> LLM
    Generator --> LLM
    Evaluator --> LLM
    Teams --> Mem
    Mem --> DB
```

### 2.3 Agent Architecture

```mermaid
flowchart TB
    subgraph Agent_Teams
        subgraph Planner_Pool
            P1[Planner Agent 1]
            P2[Planner Agent 2]
        end
        
        subgraph Generator_Pool
            G1[Generator Agent 1]
            G2[Generator Agent 2]
        end
        
        subgraph Evaluator_Pool
            E1[Evaluator Agent 1]
            E2[Evaluator Agent 2]
        end
        
        subgraph Tiebreaker
            HB[Human Agent<br/>Tie-Breaker]
        end
    end
    
    Task[User Task] --> Router{Task Router}
    Router -->|Planning| P1
    Router -->|Planning| P2
    Router -->|Generation| G1
    Router -->|Generation| G2
    Router -->|Evaluation| E1
    Router -->|Evaluation| E2
    Router -->|Deadlock| HB
    
    P1 --> Spec[Spec/Plan]
    P2 --> Spec
    Spec --> G1
    Spec --> G2
    G1 --> Output[Output]
    G2 --> Output
    Output --> E1
    Output --> E2
    E1 --> Decision{Decision}
    E2 --> Decision
    
    Decision -->|Pass| Final[Final Output]
    Decision -->|Fail| Regenerate
    Regenerate --> G1
    Decision -->|Deadlock| HB
    HB --> Final
```

---

## 3. Component Specifications

### 3.1 MCP Server Component

The MCP server exposes tools for each agent role and handles protocol communication.

**Location**: `src/mcp/server.ts`

**Responsibilities**:
- MCP protocol handshake and tool registration
- Request validation and schema enforcement
- Authentication and authorization
- Rate limiting per client/API key
- Request queuing when resources constrained

**Tools Exposed**:
| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `tensionai.execute` | Execute task with adversarial agents | `task`, `config`, `quality_level` |
| `tensionai.execute_multimodal` | Execute audio/video/image task | `task`, `media_url`, `media_type`, `config`, `quality_level` |
| `tensionai.abort` | Abort running task | `task_id` |
| `tensionai.status` | Get task status | `task_id` |
| `media.transcribe` | Transcribe audio with adversarial review | `media_url`, `language` |
| `media.describe` | Describe image with adversarial review | `media_url`, `detail_level` |
| `media.analyze_video` | Analyze video with frame-by-frame review | `media_url`, `start_time`, `end_time` |
| `memory.search` | Search project memory | `query`, `project_id`, `limit` |
| `memory.write` | Write to project memory | `content`, `project_id`, `metadata` |
| `memory.purge` | Purge project memory | `project_id` |

### 3.2 Agent Orchestrator

**Location**: `src/orchestrator/index.ts`

**Responsibilities**:
- Agent team lifecycle management
- Inter-agent communication (file-based, not shared context)
- Quality gate enforcement (pass thresholds)
- Budget tracking and enforcement
- Retry logic with exponential backoff
- Deadlock detection and human escalation

**Retry & Fallback Strategy**:

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

interface FallbackChain {
  primaryProvider: string;
  fallbackProviders: string[];  // Ordered by priority
  healthCheckIntervalMs: number;
}

class RetryWithFallback {
  private circuitBreaker: Map<string, CircuitBreakerState> = new Map();
  private defaultFailureThreshold = 5;  // Open after 5 consecutive failures
  private defaultSuccessThreshold = 3;  // Close after 3 consecutive successes in half-open

  // Update circuit breaker state based on operation result
  private updateCircuitBreaker(providerName: string, success: boolean): void {
    const state = this.circuitBreaker.get(providerName) || {
      failures: 0,
      successes: 0,
      lastFailure: 0,
      state: 'closed' as const,
      failureThreshold: this.defaultFailureThreshold,
      successThreshold: this.defaultSuccessThreshold,
      halfOpenAttempts: 0
    };

    if (success) {
      if (state.state === 'half-open') {
        state.successes++;
        // Close circuit after success threshold is reached
        if (state.successes >= state.successThreshold) {
          state.state = 'closed';
          state.failures = 0;
          state.successes = 0;
          state.halfOpenAttempts = 0;
        }
      } else if (state.state === 'closed') {
        // Reset failures on success in closed state
        state.failures = 0;
      }
    } else {
      state.lastFailure = Date.now();
      if (state.state === 'half-open') {
        // Any failure in half-open immediately opens the circuit
        state.state = 'open';
        state.halfOpenAttempts = 0;
        state.successes = 0;
      } else if (state.state === 'closed') {
        state.failures++;
        // Open circuit after failure threshold is reached
        if (state.failures >= state.failureThreshold) {
          state.state = 'open';
        }
      }
    }

    this.circuitBreaker.set(providerName, state);
  }

  // Check if circuit allows requests
  private isCircuitOpen(providerName: string): boolean {
    const state = this.circuitBreaker.get(providerName);
    if (!state) return false;

    if (state.state === 'closed') return false;

    if (state.state === 'open') {
      // Check if enough time has passed to try half-open
      const timeSinceLastFailure = Date.now() - state.lastFailure;
      if (timeSinceLastFailure >= 60000) {  // 60 second timeout
        state.state = 'half-open';
        state.halfOpenAttempts = 0;
        state.successes = 0;
        return false;  // Allow the request in half-open state
      }
      return true;  // Circuit is open, don't allow request
    }

    // Half-open state - allow limited requests to test
    if (state.halfOpenAttempts >= 3) return true;  // Limit half-open attempts
    state.halfOpenAttempts++;
    return false;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    fallbackChain?: FallbackChain
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = config.initialDelayMs;
    const providerName = this.getCurrentProvider();

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.updateCircuitBreaker(providerName, true);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.updateCircuitBreaker(providerName, false);

        // Check circuit breaker after update
        if (this.isCircuitOpen(providerName)) {
          // Try fallback provider
          if (fallbackChain) {
            const fallback = this.getNextFallback(fallbackChain);
            if (fallback) {
              this.switchProvider(fallback);
              attempt = 0;  // Reset retry count for new provider
              continue;
            }
          }
          throw new Error(`Circuit breaker open for ${providerName}`);
        }

        // Exponential backoff
        await this.sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }

    throw lastError;
  }
}

interface CircuitBreakerState {
  failures: number;
  successes: number;  // Track consecutive successes in half-open state
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;  // Number of failures to open circuit
  successThreshold: number;  // Number of successes needed to close circuit from half-open
  halfOpenAttempts: number;  // Current attempt number in half-open state
}

interface DeadlockDetection {
  maxConsecutiveRounds: number;
  minScoreVariance: number;
  detectionWindowMs: number;
}
```

**Deadlock Detection**:
- Track consecutive rounds where evaluator scores differ by < minScoreVariance
- After maxConsecutiveRounds, trigger human tie-breaker
- WebSocket notification sent to dashboard for human intervention
- Human decision recorded and used to break the deadlock

**Key Interfaces**:

```typescript
interface AgentTeam {
  id: string;
  name: string;
  role: "planner" | "generator" | "evaluator" | "tiebreaker";
  modelConfigs: ModelConfig[];
  maxRetries: number;
  passThreshold: number;
}

interface TaskRequest {
  id: string;
  prompt: string;
  projectId: string;
  qualityLevel: "fast" | "standard" | "deep";
  budget: BudgetConstraint;
  teamConfig?: Partial<TeamConfiguration>;
  userOverride?: UserOverride;
}

interface TaskResult {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  output?: string;
  error?: string;
  metrics: TaskMetrics;
  agentDebate?: AgentDebateRecord;
}
```

### 3.3 Model Provider Pool

**Location**: `src/providers/index.ts`

**Supported Providers**:
| Provider | API Type | Auth Method |
|----------|----------|-------------|
| OpenAI | OpenAI-compatible | `OPENAI_API_KEY` |
| Anthropic | Anthropic SDK | `ANTHROPIC_API_KEY` |
| MiniMax | MiniMax API | `MINIMAX_API_KEY` |
| Gemini | Google AI | `GOOGLE_API_KEY` |
| Local (vllm) | OpenAI-compatible | `VLLM_BASE_URL` |
| Local (llama.cpp) | llama.cpp server | `LLAMA_CPP_URL` |

**Provider Interface**:

```typescript
interface LLMProvider {
  name: string;
  chat(options: ChatOptions): AsyncGenerator<Chunk, void, unknown>;
  embeddings(text: string): Promise<number[]>;
  isAvailable(): Promise<boolean>;
  getModels(): Promise<Model[]>;
}

interface ChatOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}
```

### 3.4 Multimedia Service

**Location**: `src/multimedia/index.ts`

**Responsibilities**:
- Audio transcription with adversarial quality review
- Image analysis and description with multiple agent validation
- Video frame extraction and sequential analysis
- Media format conversion and validation
- Integration with vision-capable models (GPT-4V, Claude Vision, Gemini Vision)

**Supported Media Types**:
| Type | Format Support | Processing |
|------|----------------|------------|
| Audio | mp3, wav, ogg, m4a, webm | Whisper-based transcription |
| Images | png, jpg, jpeg, webp, gif, bmp | Vision model analysis |
| Video | mp4, webm, mov | Frame extraction + analysis |

**Media Interface**:

```typescript
interface MediaProvider {
  transcribe(audioUrl: string, options?: TranscribeOptions): Promise<TranscriptionResult>;
  describeImage(imageUrl: string, detailLevel: 'low' | 'high'): Promise<ImageDescription>;
  analyzeVideo(videoUrl: string, options: VideoAnalysisOptions): Promise<VideoAnalysis>;
}

interface TranscribeOptions {
  language?: string;
  prompt?: string;  // Context for better transcription
  adversarialReview?: boolean;  // Run through evaluator
}

interface TranscriptionResult {
  text: string;
  segments: Segment[];
  confidence: number;
  evaluatorScore?: number;
  evaluatorFeedback?: string;
}
```

### 3.5 Dashboard API

**Location**: `src/dashboard/api.ts`

**REST Endpoints**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task details with debate history |
| POST | `/api/tasks` | Create new task |
| POST | `/api/tasks/batch` | Create multiple tasks (batch) |
| DELETE | `/api/tasks/:id` | Abort task |
| GET | `/api/teams` | List agent team configurations |
| POST | `/api/teams` | Create team configuration |
| PUT | `/api/teams/:id` | Update team configuration |
| POST | `/api/teams/:id/agents` | Add agents to team role (3-7 agents per role) |
| DELETE | `/api/teams/:id/agents/:agentId` | Remove agent from team |
| GET | `/api/metrics` | Get system metrics |
| GET | `/api/memory/:projectId` | Get project memory summary |
| DELETE | `/api/memory/:projectId` | Purge project memory |
| GET | `/api/providers` | List providers and model status |
| POST | `/api/providers/:name/fallback` | Set fallback provider |
| GET | `/api/queue` | Get queue status |
| GET | `/health` | Health check endpoint (service status) |

**WebSocket Events**:

| Event | Payload | Description |
|-------|---------|-------------|
| `task.started` | `TaskStartedEvent` | New task began |
| `task.progress` | `TaskProgressEvent` | Agent progressed |
| `task.debate` | `AgentDebateEvent` | New agent message in debate |
| `task.completed` | `TaskCompletedEvent` | Task finished |
| `task.failed` | `TaskFailedEvent` | Task failed |
| `queue.updated` | `QueueEvent` | Queue status changed |
| `metrics.updated` | `MetricsEvent` | Resource metrics updated |
| `ws.ping` | - | Heartbeat ping (every 30 seconds) |
| `ws.pong` | - | Heartbeat pong response |

### 3.6 OpenWebUI Integration

**Location**: `src/integrations/openwebui.ts`

**Overview**: The system integrates with OpenWebUI to provide a web-based chat interface. This is implemented as a bidirectional integration where OpenWebUI acts as the frontend client.

**Integration Methods**:

| Method | Description | Use Case |
|--------|-------------|----------|
| **MCP Gateway** | Expose MCP server via OpenWebUI MCP connector | Direct MCP tool calls |
| **OAI Compatibility** | OpenAI-compatible API endpoint | Standard OAI client integration |
| **WebSocket Bridge** | Real-time debate streaming to OpenWebUI | Live visualization |

**OpenWebUI Configuration**:

```yaml
# OpenWebUI admin settings
external_connections:
  adversarial_mcp:
    type: mcp
    url: http://localhost:3000/mcp
    api_key: ${ADVERSARIAL_API_KEY}

models:
  - name: adversarial-planner
    provider: adversarial_mcp
    tool: tensionai.execute
    parameters:
      role: planner

  - name: adversarial-generator
    provider: adversarial_mcp
    tool: tensionai.execute
    parameters:
      role: generator

  - name: adversarial-evaluator
    provider: adversarial_mcp
    tool: tensionai.execute
    parameters:
      role: evaluator
```

**API Endpoints for OpenWebUI**:
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/models` | List available adversarial models |
| POST | `/api/v1/chat/completions` | OpenAI-compatible chat endpoint |
| GET | `/api/v1/chat/debate/stream` | WebSocket for real-time debate |

**OpenWebUI-Specific Features**:
- Custom adversarial agent personas pre-configured
- Debate visualization cards in chat
- Human tie-breaker intervention UI
- Project context injection from OpenWebUI workspace

---

## 4. Database Schema

### 4.1 Core Tables

```sql
-- Projects: Isolated workspaces
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE
);

-- Tasks: User requests
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    prompt TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    quality_level VARCHAR(20) DEFAULT 'standard',
    output TEXT,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_by VARCHAR(255),
    metadata JSONB DEFAULT '{}'
);

-- Agent Teams: Configured agent combinations
CREATE TABLE agent_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role_config JSONB NOT NULL,  -- Maps roles to model configs
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Task Metrics: Per-task resource usage
CREATE TABLE task_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    token_usage JSONB,
    duration_ms BIGINT,
    provider VARCHAR(50),
    model VARCHAR(100),
    cost_usd DECIMAL(10, 6),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent Debate Records: Full debate history
CREATE TABLE debate_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    round_number INTEGER,
    agent_role VARCHAR(20),
    agent_id UUID,
    input TEXT,
    output TEXT,
    score INTEGER,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Memory Tables

```sql
-- Memory: Project memory storage
CREATE TABLE memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    content TEXT NOT NULL,
    embedding VECTOR(1536),  -- or 4096 for larger models
    metadata JSONB DEFAULT '{}',
    memory_type VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT NOW(),
    accessed_at TIMESTAMP DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP  -- TTL for memory expiration
);

-- Index for vector similarity search (HNSW)
CREATE INDEX idx_memory_embedding ON memory USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Index for project isolation
CREATE INDEX idx_memory_project ON memory(project_id, memory_type);
```

### 4.3 Provider & Budget Tables

```sql
-- Provider Configuration
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    base_url VARCHAR(500),
    api_key VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Budget Constraints
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    max_tokens_per_task INTEGER,
    max_duration_ms BIGINT,
    max_cost_usd DECIMAL(10, 4),
    period VARCHAR(50),  -- 'daily', 'weekly', 'monthly', 'unlimited'
    current_usage JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Request Queue
CREATE TABLE request_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id),
    priority INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'queued',
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. API Specifications

### 5.1 Execute Task Endpoint

**Endpoint**: `POST /api/tasks`

**Request**:
```json
{
  "prompt": "Build a REST API for task management",
  "projectId": "uuid-of-project",
  "qualityLevel": "standard",
  "stream": true,
  "teamConfig": {
    "planner": { "model": "claude-sonnet-4-6" },
    "generator": { "model": "gpt-4.5" },
    "evaluator": { "model": "claude-sonnet-4-6" }
  },
  "budget": {
    "maxTokens": 50000,
    "maxDurationMs": 300000,
    "maxCostUsd": 2.00
  },
  "maxRoundsPerSprint": 10
}
```

**Response**:
```json
{
  "id": "task-uuid",
  "status": "running",
  "createdAt": "2026-03-30T10:30:00Z",
  "qualityLevel": "standard"
}
```

### 5.2 WebSocket Debate Stream

**Endpoint**: `WS /api/ws/tasks/:id/debate`

**Connection Lifecycle**:
- Client connects to WebSocket endpoint
- Server sends `ws.connected` event with sessionId
- Server sends ping every 30 seconds; client must respond with pong
- On disconnect, server sends `ws.disconnected` event

**Events**:
```json
// Heartbeat ping (server -> client every 30s)
{
  "type": "ws.ping",
  "timestamp": "2026-03-30T10:35:00Z"
}

// Heartbeat pong (client -> server)
{
  "type": "ws.pong",
  "timestamp": "2026-03-30T10:35:01Z"
}

// Connection established
{
  "type": "ws.connected",
  "sessionId": "session-uuid",
  "timestamp": "2026-03-30T10:30:00Z"
}

// Agent submits argument
{
  "type": "debate.message",
  "round": 3,
  "agent": "evaluator",
  "agentId": "agent-uuid",
  "content": "The generated code fails on edge case: empty array input causes null reference",
  "timestamp": "2026-03-30T10:35:00Z"
}

// Evaluator scores
{
  "type": "debate.score",
  "round": 3,
  "scores": [
    { "criterion": "functionality", "score": 6, "threshold": 7 }
  ],
  "passed": false,
  "feedback": "Fix null reference handling before re-evaluation"
}

// Tie-breaker activated
{
  "type": "debate.tiebreaker",
  "reason": "Agents deadlock on whether API design follows REST best practices",
  "humanInterventionRequired": true
}
```

### 5.3 Dashboard Summary Endpoint

**Endpoint**: `GET /api/dashboard/summary`

**Response**:
```json
{
  "activeTasks": 2,
  "queuedTasks": 5,
  "completedToday": 12,
  "averageLatencyMs": 45000,
  "totalCostToday": 15.42,
  "providerHealth": {
    "openai": "healthy",
    "anthropic": "healthy",
    "minimax": "degraded",
    "local-vllm": "healthy"
  },
  "recentDebates": [
    {
      "taskId": "uuid",
      "summary": "Generator and Evaluator disagree on error handling approach",
      "status": "pending_human_review"
    }
  ]
}
```

### 5.4 Health Check Endpoint

**Endpoint**: `GET /health`

**Response** (healthy):
```json
{
  "status": "healthy",
  "timestamp": "2026-03-30T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "providers": {
      "openai": "available",
      "anthropic": "available",
      "minimax": "degraded"
    }
  },
  "version": "1.0.0"
}
```

**Response** (unhealthy):
```json
{
  "status": "unhealthy",
  "timestamp": "2026-03-30T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "disconnected",
    "providers": {
      "openai": "unavailable"
    }
  },
  "errors": ["Redis connection failed: ECONNREFUSED"],
  "version": "1.0.0"
}
```

### 5.5 Cost Calculation Service

**Purpose**: Track and calculate costs based on provider rates

**Rate Configuration** (stored in database):
```json
{
  "provider_rates": {
    "openai": {
      "gpt-4": { "input": 0.03, "output": 0.06 },
      "gpt-4.5": { "input": 0.015, "output": 0.075 }
    },
    "anthropic": {
      "claude-sonnet-4-6": { "input": 0.003, "output": 0.015 },
      "claude-opus-4-5": { "input": 0.015, "output": 0.075 }
    },
    "minimax": {
      "abab6.5s": { "input": 0.004, "output": 0.004 }
    }
  }
}
```

**Cost Calculation**:
```typescript
interface CostCalculation {
  calculateTaskCost(taskId: string): Promise<CostResult>;
  calculateTokenCost(provider: string, model: string, inputTokens: number, outputTokens: number): number;
  getProviderRates(provider: string): ProviderRates;
}

interface CostResult {
  taskId: string;
  totalCostUsd: number;
  inputCost: number;
  outputCost: number;
  tokens: { input: number; output: number };
  provider: string;
  model: string;
}
```

---

## 6. Technology Stack

### 6.1 Backend Stack

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| **Runtime** | Bun | 1.x | Fast startup, native TypeScript, excellent for MCP servers |
| **Framework** | Fastify | 4.x | High-performance HTTP, built-in WebSocket support |
| **MCP** | @modelcontextprotocol/server | latest | Standard MCP protocol implementation |
| **Database** | PostgreSQL | 16+ | Production data, vector search extension |
| **ORM** | Drizzle | 0.20+ | Lightweight, type-safe, Bun-native |
| **Caching** | Redis | 7+ | Queue management, real-time metrics |
| **LLM SDKs** | openai (OpenAI-compatible) + anthropic | latest | Multi-provider support |
| **Logging** | Pino | 9.x | Structured logging, low overhead |
| **Cost Calculation** | Custom service | - | Provider rate tracking and cost estimation |

### 6.2 Frontend Dashboard

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| **Framework** | React | 18.x | Production dashboard |
| **Build** | Vite | 5.x | Fast dev + build |
| **State** | Zustand | 4.x | Lightweight, TypeScript |
| **UI** | TailwindCSS | 3.x | Utility-first, dark theme |
| **Charts** | Recharts | 2.x | Simple, React-native |
| **WebSocket** | Native browser WS | - | Real-time updates |

### 6.3 Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Container** | Docker | Host network mode for local LLM access |
| **Orchestration** | Docker Compose | Local dev + production |
| **Auth** | JWT + API Keys | Flexible auth for MCP clients |
| **Monitoring** | Prometheus + Grafana | Industry standard metrics |

### 6.4 Memory Backends (Configurable)

| Backend | Use Case | Configuration |
|--------|----------|---------------|
| **OpenMemory** | Default cloud | `OPENMEMORY_API_KEY` |
| **Cognee** | Graph-based | `COGNEE_API_KEY` |
| **Mem0** | Managed memory | `MEM0_API_KEY` |
| **Local (PostgreSQL)** | Self-hosted | Via `memory.provider: local` |

---

## 7. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goals**: Core MCP server with basic adversarial orchestration

**Deliverables**:
- [ ] Initialize Bun project with Fastify
- [ ] Implement MCP server with protocol handler
- [ ] Create LLM provider pool (OpenAI, Anthropic)
- [ ] Build basic 3-agent orchestration (Planner/Generator/Evaluator)
- [ ] Implement file-based inter-agent communication
- [ ] Basic task execution API

**Testing**:
- MCP tools respond to test requests
- Agents can complete simple tasks in sequence

### Phase 2: Multi-Model Support (Weeks 3-4)

**Goals**: Expand to all required model providers

**Deliverables**:
- [ ] Add MiniMax, Gemini, local (vllm/llama.cpp) providers
- [ ] Provider health checking and fallback logic
- [ ] Model switching API
- [ ] Token tracking per request
- [ ] Basic cost tracking

**Testing**:
- All providers can be invoked
- Fallback triggers when provider unavailable

### Phase 3: Resource Management (Weeks 5-6)

**Goals**: Budget controls, queuing, and rate limiting

**Deliverables**:
- [ ] Request queue with priority
- [ ] Budget constraint enforcement per project
- [ ] Quality level auto-detection (Fast/Standard/Deep)
- [ ] Rate limiting per API key
- [ ] Alert system for unavailable services

**Testing**:
- Queue processes tasks in priority order
- Budget limits are enforced
- Fallback providers activate when primary fails

### Phase 4: Dashboard & Monitoring (Weeks 7-8)

**Goals**: Real-time dashboard with debate monitoring

**Deliverables**:
- [ ] Dashboard frontend with dark theme
- [ ] WebSocket for real-time debate streaming
- [ ] Task list with filtering and search
- [ ] Resource usage charts
- [ ] "Dig deeper" view for full debate history

**Testing**:
- Dashboard loads without debate internals
- User can see summary + expand details
- Human can intervene as tie-breaker

### Phase 5: Memory System & Multimedia (Weeks 9-10)

**Goals**: Project-isolated memory with multiple backends; multimedia (Phase 3 content moved to Phase 5 for faster MVP)

**Deliverables**:
- [ ] Memory service with plugin architecture
- [ ] PostgreSQL vector storage
- [ ] Project isolation enforcement
- [ ] Memory purge API
- [ ] Integration with OpenMemory/Cognee/Mem0 (configurable)
- [ ] LLM-powered indexing (use configured model for embedding)
- [ ] Audio transcription with adversarial quality review (moved from original Phase 3)
- [ ] Image analysis and description with multiple agent validation
- [ ] Video frame extraction and sequential analysis

**Testing**:
- Memory search returns relevant results
- Project isolation prevents cross-project access
- Purge removes all project memory

### Phase 6: Agent Teams & Configuration (Weeks 11-12)

**Goals**: Flexible team configuration with presets

**Deliverables**:
- [ ] Team configuration CRUD API
- [ ] Preset templates (fast/balanced/thorough)
- [ ] Auto-assignment based on task type
- [ ] User override capability
- [ ] Model switching via dashboard

**Testing**:
- Custom team configurations work
- Auto-assignment routes tasks correctly
- Override takes precedence over auto-assign

### Phase 7: Docker & Deployment (Weeks 13-14)

**Goals**: Production-ready Docker deployment

**Deliverables**:
- [ ] Dockerfile with host network mode
- [ ] Docker Compose for full stack
- [ ] Environment variable configuration
- [ ] Health check endpoints
- [ ] Production logging and monitoring

**Testing**:
- Container runs with host network
- All services communicate correctly
- Health checks pass

### Phase 8: Integration & E2E Testing (Weeks 15-16)

**Goals**: Full integration testing with all interfaces

**Deliverables**:
- [ ] IDE integration (Roo Code, Cursor, Claude)
- [ ] CLI client
- [ ] OpenWebUI integration
- [ ] E2E test suite
- [ ] Performance benchmarking
- [ ] Documentation

**Testing**:
- All interfaces can connect and execute tasks
- End-to-end task completion
- Performance meets SLA targets

---

## 8. Configuration Reference

### 8.1 Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/adversarial

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-key
API_KEYS=key1,key2,key3

# Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINIMAX_API_KEY=...
GOOGLE_API_KEY=...

# Local Models
VLLM_BASE_URL=http://localhost:8000
LLAMA_CPP_URL=http://localhost:8080

# Memory (optional)
OPENMEMORY_API_KEY=...
COGNEE_API_KEY=...
MEM0_API_KEY=...

# Feature Flags
ENABLE_TIEBREAKER=true
AUTO_DETECT_QUALITY=true
```

### 8.2 Docker Compose

```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    # Two network modes available:
    # 1. host mode (for local LLM access): network_mode: host
    # 2. bridge mode (for production isolation):
    networks:
      - adversarial-network
    environment:
      - DATABASE_URL=postgresql://postgres:5432/adversarial
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - adversarial-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - adversarial-network

  local-llm:
    image: vllm/vllm:latest
    ports:
      - "8000:8000"
    volumes:
      - models:/models
    network_mode: host  # Required for local GPU access

networks:
  adversarial-network:
    driver: bridge

volumes:
  postgres_data:
  models:
```

---

## 9. Quality Levels

| Level | Token Limit | Duration | Use Case |
|-------|-------------|----------|----------|
| **Fast** | 10,000 | 60s | Quick edits, simple questions |
| **Standard** | 50,000 | 5min | Feature development, analysis |
| **Deep** | 200,000 | 30min | Complex systems, full applications |

**Auto-Detection Heuristics** (explicit quality rules):

**Fast Level** - Triggered when ANY of:
- Prompt contains: "fix", "bug", "typo", "refactor", "quick", "simple"
- File extensions modified: .json, .yaml, .txt, .md, .env
- Line count estimate < 50 lines
- Contains keywords: "read", "list", "get", "show"
- No mention of: "new", "create", "build", "implement"

**Standard Level** - Triggered when ANY of:
- Prompt mentions: "feature", "function", "class", "module", "api", "endpoint"
- File extensions: .ts, .js, .py, .go with multiple files
- Line count estimate 50-500 lines
- Contains keywords: "add", "update", "implement", "create"
- Mentions: "test", "error handling", "validation"

**Deep Level** - Triggered when ANY of:
- Prompt mentions: "application", "system", "architecture", "full", "complete"
- Multiple new files or directories
- Line count estimate > 500 lines
- Contains keywords: "migrate", "refactor", "redesign", "optimize"
- Mentions: "database", "authentication", "security", "deployment"

**Manual Override**: Users can explicitly set `qualityLevel` in request to bypass auto-detection.

---

## 10. Security Considerations

1. **API Keys**: Stored encrypted at rest, rotated via config
2. **Project Isolation**: Memory and tasks scoped to project_id
3. **Rate Limiting**: Per-API key, configurable per-project
4. **Audit Logging**: All task executions logged with user attribution
5. **Network**: Host mode for local model access; no external exposure of local models
6. **Input Validation**: All MCP tool inputs validated with Zod schemas

---

## 11. Documentation

The following documentation files are available for this project:

| Document | Description |
|----------|-------------|
| [Installation Guide](./installation.md) | Complete installation guide including prerequisites, environment setup, API key configuration, local model setup (vllm, llama.cpp), Docker installation, and troubleshooting |
| [Usage Guide](./usage.md) | Complete usage guide covering starting the server, MCP tools, REST API, CLI client, dashboard, IDE integration (Roo Code, Cursor, Claude), quality levels, and agent teams configuration |
| [Examples](./examples.md) | Real-world examples including code generation, writing/research, custom team configuration, budget configuration, memory usage, and multimedia processing |
| [FAQ](./faq.md) | Frequently asked questions covering general questions, provider questions, configuration questions, troubleshooting, performance, and security |
| [Getting Started](./getting-started.md) | Quick start guide for new users |
| [API Reference](./api-reference.md) | Detailed API endpoint documentation |
| [MCP Tools](./mcp-tools.md) | MCP tool-specific usage documentation |

---

## 12. Open Questions

The following items require additional input before finalization:

1. **Authentication Model**: Should MCP clients use API keys, OAuth, or both?
2. **Local Model Hardware**: What GPU/CPU specs are available for vllm/llama.cpp?
3. **Memory Backend Preference**: Which memory provider (OpenMemory/Cognee/Mem0/local) is preferred for initial implementation?
4. **SLA Requirements**: What latency and throughput targets should the system meet?
5. **Multimedia Processing**: Should audio/video processing use local Whisper or cloud transcription API?

---

## 13. Next Steps

1. **Review**: Share this proposal for team review and feedback
2. **Prioritize**: Confirm which phases to implement in initial release
3. **Environment**: Confirm local model hardware availability
4. **Prototype**: Begin Phase 1 with basic MCP server setup

---

## 14. Appendix: Version History

---

*Document Version: 1.3*
*Created: 2026-03-30*
*Status: Updated with documentation links to installation.md, usage.md, examples.md, and faq.md*
