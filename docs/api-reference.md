# API Reference

Complete API reference for the TensionAI Multi-Agent MCP Server.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently, the API does not require authentication. To add authentication:

```bash
# Set API key in environment
export ADVERSARY_API_KEY=your-secret-key
```

## Endpoints

### Health Check

**GET** `/health`

Check server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-30T20:00:00.000Z",
  "version": "1.0.0"
}
```

---

### Server Info

**GET** `/api/info`

Get server information and capabilities.

**Response:**
```json
{
  "name": "TensionAI Multi-Agent MCP Server",
  "version": "1.0.0",
  "mcpTools": ["adversarial_execute", "adversarial_status", ...],
  "capabilities": ["adversarial_execution", "multi_provider_support", ...],
  "providers": ["openai", "anthropic", "minimax", "gemini"],
  "defaultProvider": "openai"
}
```

---

### Tasks

#### Create Task

**POST** `/api/tasks`

Execute a task using the adversarial multi-agent system.

**Request Body:**
```json
{
  "prompt": "Build a REST API",
  "projectId": "my-project",
  "qualityLevel": "standard",
  "maxSprints": 10,
  "passThreshold": 7,
  "maxRetriesPerSprint": 3,
  "provider": "anthropic",
  "model": "claude-sonnet-3-5-20250219"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The task prompt |
| `projectId` | string | No | Project ID (default: "default") |
| `qualityLevel` | string | No | "fast", "standard", or "deep" |
| `maxSprints` | number | No | Override max sprints |
| `passThreshold` | number | No | Min score to pass (default: 7) |
| `maxRetriesPerSprint` | number | No | Retries before failing |
| `provider` | string | No | Provider name |
| `model` | string | No | Model name |

**Response:**
```json
{
  "id": "task-1700000000000-abc123",
  "status": "running",
  "createdAt": "2026-03-30T20:00:00.000Z",
  "qualityLevel": "standard"
}
```

#### List Tasks

**GET** `/api/tasks`

List all tasks, optionally filtered by status.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: pending, running, completed, failed, aborted |
| `limit` | number | Max tasks to return (default: 20) |

**Response:**
```json
[
  {
    "id": "task-1700000000000-abc123",
    "status": "completed",
    "createdAt": "2026-03-30T20:00:00.000Z"
  }
]
```

#### Get Task Status

**GET** `/api/tasks/:id`

Get detailed task status.

**Response:**
```json
{
  "id": "task-1700000000000-abc123",
  "status": "completed",
  "output": "Completed 3 of 3 sprints",
  "metrics": {
    "totalDurationMs": 120000,
    "totalTokensUsed": 15000,
    "totalCostUsd": 0.45,
    "sprintsCompleted": 3,
    "retries": 1
  },
  "sprints": [
    {
      "sprintNumber": 1,
      "passed": true,
      "attempts": 1,
      "durationMs": 40000
    }
  ]
}
```

#### Abort Task

**DELETE** `/api/tasks/:id`

Abort a running task.

**Response:**
```json
{
  "success": true,
  "taskId": "task-1700000000000-abc123"
}
```

---

### Providers

#### List Providers

**GET** `/api/providers`

List available providers.

**Response:**
```json
[
  {
    "name": "openai",
    "available": true,
    "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
  }
]
```

#### Provider Health

**GET** `/api/providers/health`

Get health status of all providers.

**Response:**
```json
{
  "providers": {
    "openai": {
      "available": true,
      "latencyMs": 150,
      "lastChecked": "2026-03-30T20:00:00.000Z"
    }
  }
}
```

#### Force Health Check

**POST** `/api/providers/health/check`

Force health check for all providers.

#### Switch Provider

**POST** `/api/providers/switch`

Switch the default provider.

**Request Body:**
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-3-5-20250219"
}
```

#### Set Fallback Chain

**POST** `/api/providers/fallback`

Set provider fallback chain.

**Request Body:**
```json
{
  "chain": ["openai", "anthropic", "minimax"]
}
```

---

### Metrics

#### Get Aggregate Metrics

**GET** `/api/metrics`

Get aggregate metrics.

**Response:**
```json
{
  "totalRequests": 100,
  "tokens": {
    "inputTokens": 500000,
    "outputTokens": 250000,
    "totalTokens": 750000
  },
  "cost": {
    "inputCost": 2.5,
    "outputCost": 3.75,
    "totalCost": 6.25,
    "currency": "USD"
  },
  "averageDurationMs": 5000
}
```

#### Get Metrics by Provider

**GET** `/api/metrics/by-provider`

Get metrics broken down by provider.

#### Get Request History

**GET** `/api/metrics/history`

Get request history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max records (default: 100) |

#### Reset Metrics

**POST** `/api/metrics/reset`

Reset all metrics.

---

### Queue

#### Get Queue Status

**GET** `/api/queue/status`

Get current queue status.

**Response:**
```json
{
  "queued": 5,
  "processing": 2,
  "completed": 100,
  "failed": 3,
  "total": 110
}
```

#### Get Queue Config

**GET** `/api/queue/config`

Get queue configuration.

#### Update Queue Config

**POST** `/api/queue/config`

Update queue configuration.

**Request Body:**
```json
{
  "maxConcurrentPerProject": 5,
  "maxQueueSizePerProject": 50,
  "defaultPriority": "normal",
  "processingTimeoutMs": 300000
}
```

---

### Teams

#### List Teams

**GET** `/api/teams`

List all team configurations.

#### Create Team

**POST** `/api/teams`

Create a new team configuration.

**Request Body:**
```json
{
  "name": "My Custom Team",
  "description": "Custom team for web apps",
  "minAgents": 2,
  "maxAgents": 4,
  "agents": [
    {
      "role": "planner",
      "model": "claude-sonnet-3-5-20250219",
      "provider": "anthropic",
      "maxRetries": 3
    }
  ]
}
```

#### Get Team

**GET** `/api/teams/:id`

Get team by ID.

#### Update Team

**PUT** `/api/teams/:id`

Update team configuration.

#### Delete Team

**DELETE** `/api/teams/:id`

Delete team.

#### List Presets

**GET** `/api/teams/presets`

List available team presets.

**Response:**
```json
[
  {
    "name": "fast",
    "description": "Fast execution with minimal agents",
    "agentCount": 3,
    "maxSprints": 3,
    "maxRetriesPerSprint": 1
  }
]
```

#### Auto-assign Team

**POST** `/api/teams/autoassign`

Auto-assign team based on prompt.

**Request Body:**
```json
{
  "prompt": "Build a REST API",
  "userId": "user-123",
  "projectId": "project-456"
}
```

---

### Memory

#### Get Project Memory

**GET** `/api/memory/:projectId`

Get memory entries for a project.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max entries (default: 100) |
| `offset` | number | Offset for pagination |

#### Write to Memory

**POST** `/api/memory/:projectId`

Write content to project memory.

**Request Body:**
```json
{
  "content": "Important context about this project",
  "metadata": {"source": "user"},
  "memoryType": "general"
}
```

#### Search Memory

**GET** `/api/memory/:projectId/search`

Search project memory.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `limit` | number | Max results (default: 10) |
| `threshold` | number | Similarity threshold (default: 0.7) |
| `type` | string | Filter by memory type |

#### Purge Memory

**DELETE** `/api/memory/:projectId`

Purge all memory for a project.

#### Get Memory Config

**GET** `/api/memory/config`

Get memory configuration.

#### Update Memory Config

**PUT** `/api/memory/config`

Update memory configuration.

**Request Body:**
```json
{
  "provider": "local",
  "embeddingModel": "BAAI/bge-small-en-v1.5",
  "similarityThreshold": 0.8
}
```

---

### Budget

#### Get Budget Status

**GET** `/api/budget/:projectId`

Get budget status for a project.

#### Set Budget

**POST** `/api/budget`

Set budget for a project.

**Request Body:**
```json
{
  "projectId": "my-project",
  "maxTokens": 100000,
  "maxDurationMs": 600000,
  "maxCostUsd": 10.0
}
```

#### Reset Budget

**POST** `/api/budget/:projectId/reset`

Reset budget for a project.

---

### Rate Limiting

#### Get Rate Limit Status

**GET** `/api/ratelimit/status`

Get rate limit status for an API key.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | API key (required) |
| `projectId` | string | Project ID (optional) |

#### Set Rate Limits

**POST** `/api/ratelimit`

Set rate limits for an API key.

**Request Body:**
```json
{
  "apiKey": "sk-...",
  "projectId": "my-project",
  "maxRequestsPerMinute": 60,
  "maxRequestsPerHour": 1000,
  "maxTokensPerMinute": 100000,
  "maxTokensPerHour": 500000
}
```

---

### Alerts

#### Get Active Alerts

**GET** `/api/alerts`

Get active alerts.

#### Get Alert Stats

**GET** `/api/alerts/stats`

Get alert statistics.

#### Acknowledge Alert

**POST** `/api/alerts/:alertId/acknowledge`

Acknowledge an alert.

#### Resolve Alert

**POST** `/api/alerts/:alertId/resolve`

Resolve an alert.

#### Clear Alerts

**POST** `/api/alerts/clear`

Clear all alerts.

---

### Dashboard

#### Get Dashboard Summary

**GET** `/api/dashboard/summary`

Get dashboard summary.

**Response:**
```json
{
  "activeTasks": 2,
  "queuedTasks": 5,
  "completedToday": 50,
  "averageLatencyMs": 5000,
  "totalCostToday": 25.50,
  "providerHealth": {
    "openai": "healthy",
    "anthropic": "healthy"
  }
}
```

#### Get Task Debate History

**GET** `/api/tasks/:id/debate`

Get debate history for a task.

#### WebSocket

**GET** `/api/ws`

WebSocket endpoint for real-time updates.

---

### Error Responses

All endpoints may return error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error
