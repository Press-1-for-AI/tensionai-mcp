# MCP Tools Reference

Documentation for the Model Context Protocol (MCP) tools exposed by the TensionAI Multi-Agent MCP Server.

## Overview

The server exposes the following MCP tools that can be used by MCP clients (Roo Code, Cursor, Claude Desktop, etc.):

## Task Execution Tools

### adversarial_execute

Execute a task using the adversarial multi-agent system (Planner/Generator/Evaluator).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The user's task prompt/description |
| `projectId` | string | No | Project ID for isolation (default: "default") |
| `qualityLevel` | string | No | Quality level: "fast", "standard", "deep" |
| `maxSprints` | number | No | Maximum number of sprints (overrides qualityLevel) |
| `passThreshold` | number | No | Minimum score threshold for passing (default: 7) |
| `maxRetriesPerSprint` | number | No | Maximum retries per sprint (default: 3) |

**Example:**
```json
{
  "prompt": "Build a REST API with authentication",
  "projectId": "my-project",
  "qualityLevel": "standard",
  "maxSprints": 10,
  "passThreshold": 7
}
```

**Returns:**
```json
{
  "taskId": "task-1700000000000-abc123",
  "status": "running"
}
```

---

### adversarial_status

Get the status of a running or completed task.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | The task ID to check |

**Example:**
```json
{
  "taskId": "task-1700000000000-abc123"
}
```

**Returns:**
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

---

### adversarial_abort

Abort a running task.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | The task ID to abort |

**Example:**
```json
{
  "taskId": "task-1700000000000-abc123"
}
```

**Returns:**
```json
{
  "success": true,
  "taskId": "task-1700000000000-abc123"
}
```

---

### adversarial_list_tasks

List all tasks and their status.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: pending, running, completed, failed, aborted |
| `limit` | number | No | Maximum number of tasks to return (default: 20) |

**Example:**
```json
{
  "status": "running",
  "limit": 10
}
```

**Returns:**
```json
[
  {
    "id": "task-1700000000000-abc123",
    "status": "running",
    "metrics": {
      "totalDurationMs": 5000,
      "totalTokensUsed": 1000,
      "totalCostUsd": 0.03,
      "sprintsCompleted": 0,
      "retries": 0
    }
  }
]
```

---

## Memory Tools

### memory_search

Search project memory by semantic similarity.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The search query text |
| `projectId` | string | No | Project ID for isolation (default: "default") |
| `limit` | number | No | Maximum number of results (default: 10) |
| `threshold` | number | No | Similarity threshold (default: 0.7) |

**Example:**
```json
{
  "query": "authentication implementation",
  "projectId": "my-project",
  "limit": 5,
  "threshold": 0.8
}
```

**Returns:**
```json
{
  "results": [
    {
      "id": "mem-abc123",
      "content": "JWT authentication was implemented using...",
      "score": 0.92
    }
  ],
  "totalCount": 1
}
```

---

### memory_write

Write content to project memory.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The content to store in memory |
| `projectId` | string | No | Project ID for isolation (default: "default") |
| `metadata` | object | No | Optional metadata to attach to the memory |
| `memoryType` | string | No | Type of memory: "general", "code", "docs" (default: "general") |

**Example:**
```json
{
  "content": "This project uses JWT tokens for authentication with 1-hour expiry",
  "projectId": "my-project",
  "metadata": {
    "source": "planning",
    "sprint": 1
  },
  "memoryType": "code"
}
```

**Returns:**
```json
{
  "id": "mem-xyz789",
  "success": true
}
```

---

### memory_purge

Purge all memory for a project.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID to purge memory for |

**Example:**
```json
{
  "projectId": "my-project"
}
```

**Returns:**
```json
{
  "deletedCount": 42
}
```

---

## Using MCP Tools

### Via REST API

You can also call MCP tools via the REST API:

```bash
# Execute task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Build a hello world"}'

# Check status
curl http://localhost:3000/api/tasks/TASK_ID

# Memory search
curl "http://localhost:3000/api/memory/my-project/search?q=auth&limit=5"
```

### Via MCP Client

#### Roo Code

Add to your `mcpServers.json`:

```json
{
  "mcpServers": {
    "tensionai-mcp": {
      "command": "bun",
      "args": ["run", "src/index.ts"]
    }
  }
}
```

Then use the tools in your prompts:

```
Use the adversarial_execute tool to build a REST API.
```

#### Claude Desktop

Add to your settings.json:

```json
{
  "mcpServers": {
    "tensionai-mcp": {
      "command": "bun",
      "args": ["run", "src/index.ts"]
    }
  }
}
```

### Via CLI Client

```bash
# Execute a task
bun run src/cli/client.ts execute "Build a REST API"

# Check task status
bun run src/cli/client.ts status task-123

# List tasks
bun run src/cli/client.ts list running
```

## Tool Schemas

### Full JSON Schema

```json
{
  "tools": [
    {
      "name": "adversarial_execute",
      "description": "Execute a task using the adversarial multi-agent system (Planner/Generator/Evaluator)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "prompt": {
            "type": "string",
            "description": "The user's task prompt/description"
          },
          "projectId": {
            "type": "string",
            "description": "Project ID for isolation (optional, defaults to 'default')"
          },
          "qualityLevel": {
            "type": "string",
            "enum": ["fast", "standard", "deep"],
            "description": "Quality level: fast (3 sprints), standard (10 sprints), deep (20 sprints)"
          },
          "maxSprints": {
            "type": "number",
            "description": "Maximum number of sprints (overrides qualityLevel)"
          },
          "passThreshold": {
            "type": "number",
            "description": "Minimum score threshold for passing (default: 7)"
          }
        },
        "required": ["prompt"]
      }
    }
  ]
}
```

## Best Practices

1. **Use project isolation**: Set unique `projectId` for different projects to keep memory separate

2. **Choose appropriate quality level**:
   - `fast` for prototyping and quick iterations
   - `standard` for typical development tasks
   - `deep` for complex applications requiring thorough testing

3. **Leverage memory**: Write relevant context to memory before executing related tasks

4. **Monitor with quality thresholds**: Adjust `passThreshold` based on your quality requirements (7 is default, 8+ for stricter evaluation)

5. **Use abort when needed**: Call `adversarial_abort` if a task is taking too long or appears stuck
