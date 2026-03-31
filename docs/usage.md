# Usage Guide

Comprehensive guide to using the TensionAI Multi-Agent MCP Server.

## Table of Contents

- [Starting the Server](#starting-the-server)
- [Using MCP Tools](#using-mcp-tools)
- [Using the REST API](#using-the-rest-api)
- [Using the CLI Client](#using-the-cli-client)
- [Using the Dashboard](#using-the-dashboard)
- [Using with IDEs](#using-with-ides)
- [Quality Levels](#quality-levels)
- [Agent Teams Configuration](#agent-teams-configuration)

---

## Starting the Server

### Development Mode

For development with auto-reload:

```bash
bun run dev
```

The server will start on `http://localhost:3000` with hot-reload enabled.

### Production Mode

For production deployment:

```bash
bun run start
```

### Docker Mode

```bash
# Build and run
docker build -t tensionai-mcp .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-xxx tensionai-mcp

# Or use docker-compose
docker-compose up -d
```

### Verify Server Status

```bash
# Health check
curl http://localhost:3000/health

# Server info
curl http://localhost:3000/api/info
```

---

## Using MCP Tools

The server exposes MCP tools for integration with various clients.

### Available MCP Tools

| Tool | Description | Parameters |
|------|-------------|-------------|
| `adversarial.execute` | Execute a task with adversarial agents | `task`, `config`, `quality_level` |
| `adversarial.execute_multimodal` | Process audio/video/image | `task`, `media_url`, `media_type`, `config` |
| `adversarial.abort` | Abort a running task | `task_id` |
| `adversarial.status` | Get task status | `task_id` |
| `adversarial.list_tasks` | List all tasks | `limit`, `status`, `project_id` |
| `media.transcribe` | Transcribe audio with adversarial review | `media_url`, `language` |
| `media.describe` | Describe image with adversarial review | `media_url`, `detail_level` |
| `media.analyze_video` | Analyze video with frame-by-frame review | `media_url`, `start_time`, `end_time` |
| `memory.search` | Search project memory | `query`, `project_id`, `limit` |
| `memory.write` | Write to project memory | `content`, `project_id`, `metadata` |
| `memory.purge` | Purge project memory | `project_id` |

### MCP Request Example

```json
{
  "name": "adversarial_execute",
  "arguments": {
    "task": "Write a hello world function in Python",
    "quality_level": "fast",
    "config": {
      "maxSprints": 3
    }
  }
}
```

---

## Using the REST API

### Task Endpoints

#### Create Task

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a REST API for task management",
    "qualityLevel": "standard",
    "projectId": "my-project"
  }'
```

**Response:**
```json
{
  "id": "task-uuid-xxxxx",
  "status": "running",
  "createdAt": "2026-03-30T10:30:00Z",
  "qualityLevel": "standard"
}
```

#### Get Task Status

```bash
curl http://localhost:3000/api/tasks/{task_id}
```

**Response:**
```json
{
  "id": "task-uuid-xxxxx",
  "status": "completed",
  "output": "def hello_world():\n    return \"Hello, World!\"",
  "metrics": {
    "durationMs": 45000,
    "tokenUsage": { "input": 2000, "output": 500 },
    "costUsd": 0.02
  }
}
```

#### List Tasks

```bash
curl "http://localhost:3000/api/tasks?limit=10&status=completed"
```

#### Abort Task

```bash
curl -X DELETE http://localhost:3000/api/tasks/{task_id}
```

### Provider Endpoints

#### List Providers

```bash
curl http://localhost:3000/api/providers
```

**Response:**
```json
{
  "providers": [
    { "name": "openai", "status": "available", "models": ["gpt-4o", "gpt-4o-mini"] },
    { "name": "anthropic", "status": "available", "models": ["claude-sonnet-4-6"] },
    { "name": "minimax", "status": "unavailable", "models": [] }
  ]
}
```

#### Provider Health

```bash
curl http://localhost:3000/api/providers/health
```

### Team Configuration Endpoints

#### List Teams

```bash
curl http://localhost:3000/api/teams
```

#### Create Team

```bash
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "fast-team",
    "description": "Quick response team",
    "planner": { "model": "gpt-4o-mini" },
    "generator": { "model": "gpt-4o-mini" },
    "evaluator": { "model": "gpt-4o-mini" }
  }'
```

### Memory Endpoints

#### Search Memory

```bash
curl "http://localhost:3000/api/memory/my-project?query=api+design"
```

#### Write Memory

```bash
curl -X POST http://localhost:3000/api/memory/my-project \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Use RESTful API design with /resources endpoint pattern",
    "metadata": { "source": "task-123", "type": "architecture" }
  }'
```

#### Purge Memory

```bash
curl -X DELETE http://localhost:3000/api/memory/my-project
```

### Metrics Endpoints

```bash
# Get aggregate metrics
curl http://localhost:3000/api/metrics

# Get queue status
curl http://localhost:3000/api/queue/status

# Get dashboard summary
curl http://localhost:3000/api/dashboard/summary
```

---

## Using the CLI Client

### Installation

The CLI is included with the server:

```bash
# Add to PATH or use bun run
bun run cli --help
```

### Commands

#### Execute Task

```bash
bun run cli execute "Write a hello world function in Python"
```

With options:

```bash
bun run cli execute "Build a REST API" \
  --quality standard \
  --project my-project \
  --team balanced
```

#### List Tasks

```bash
bun run cli tasks --status completed --limit 10
```

#### Check Status

```bash
bun run cli status task-uuid-xxxxx
```

#### Abort Task

```bash
bun run cli abort task-uuid-xxxxx
```

#### Interactive Mode

```bash
bun run cli chat
```

This starts an interactive chat session with the adversarial agent system.

### CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--quality` | `-q` | Quality level (fast/standard/deep) | auto |
| `--project` | `-p` | Project ID | default |
| `--team` | `-t` | Team preset name | auto |
| `--model` | `-m` | Override model | none |
| `--stream` | `-s` | Stream output | false |

---

## Using the Dashboard

The dashboard provides a web interface for monitoring and controlling tasks.

### Access

Open `http://localhost:3000` in your browser.

### Dashboard Features

#### Task Monitoring

- View all tasks with status
- Filter by status, date, project
- Expand to see full debate history

#### Real-Time Updates

- WebSocket connection for live updates
- See agent debates as they happen
- Task progress indicators

#### Team Management

- Create custom agent teams
- Configure models per role
- Set quality thresholds

#### Metrics

- Token usage charts
- Cost tracking
- Provider health status

### Screenshot Descriptions

#### Task List View
Shows all tasks with status indicators:
- Green badge: completed
- Yellow badge: running
- Red badge: failed
- Click to expand debate history

#### Debate View
Real-time agent debate visualization:
- Agent messages with timestamps
- Evaluator scores
- Pass/fail indicators

#### Team Configuration
Form for creating custom teams:
- Role selection (planner/generator/evaluator)
- Model dropdown per role
- Quality threshold slider

---

## Using with IDEs

### Roo Code

1. Open Settings (Ctrl+, or Cmd+,)
2. Navigate to MCP Servers
3. Add new server:

```json
{
  "mcpServers": {
    "adversarial": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "env": {
        "OPENAI_API_KEY": "sk-xxx"
      }
    }
  }
}
```

4. Restart Roo Code

**Usage in Chat:**
```
@adversarial Write a hello world function in Python
```

### Cursor

1. Open Settings → Features → Integrations
2. Add MCP Server:

```json
{
  "mcpServers": {
    "adversarial": {
      "command": "bun",
      "args": ["run", "src/index.ts"]
    }
  }
}
```

3. Use in Cursor chat:

```
Write a REST API endpoint for user authentication
```

### Claude Desktop

1. Find config file:
   - macOS: `~/Library/Application Support/Claude/settings.json`
   - Windows: `%APPDATA%/Claude/settings.json`

2. Add to `mcpServers`:

```json
{
  "mcpServers": {
    "adversarial": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

3. Restart Claude Desktop

**Usage:**
```
Use the adversarial server to build a todo list application
```

### VS Code with Copilot

For VS Code, you can use the MCP server with custom chat extensions:

```json
{
  "adversarial.server": {
    "command": "bun run src/index.ts"
  }
}
```

---

## Quality Levels

The system supports three quality levels that control resource usage and thoroughness.

### Level Comparison

| Level | Token Limit | Duration | Max Sprints | Use Case |
|-------|-------------|----------|-------------|----------|
| **Fast** | 10,000 | 60s | 3 | Quick edits, simple questions |
| **Standard** | 50,000 | 5min | 10 | Feature development, analysis |
| **Deep** | 200,000 | 30min | 20 | Complex systems, full applications |

### Auto-Detection

The system automatically detects appropriate quality level based on task content:

**Fast Level** - Triggered by:
- Keywords: "fix", "bug", "typo", "quick", "simple"
- File types: .json, .yaml, .txt, .md, .env
- Line estimate: < 50 lines
- Query words: "read", "list", "get", "show"

**Standard Level** - Triggered by:
- Keywords: "feature", "function", "class", "module", "api"
- File types: .ts, .js, .py, .go (multiple files)
- Line estimate: 50-500 lines
- Action words: "add", "update", "implement", "create"

**Deep Level** - Triggered by:
- Keywords: "application", "system", "architecture", "complete"
- Large refactoring or new projects
- Line estimate: > 500 lines
- Complex topics: "database", "authentication", "security"

### Manual Override

Override auto-detection by explicitly setting quality level:

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a todo app",
    "qualityLevel": "deep"
  }'
```

---

## Agent Teams Configuration

### Default Teams

The system includes preset team configurations:

| Team | Planner | Generator | Evaluator | Use Case |
|------|---------|-----------|-----------|----------|
| **fast** | gpt-4o-mini | gpt-4o-mini | gpt-4o-mini | Quick tasks |
| **balanced** | gpt-4o | gpt-4o | gpt-4o | Standard work |
| **thorough** | claude-opus-4-5 | claude-opus-4-5 | claude-opus-4-5 | Complex tasks |

### Custom Teams

Create custom teams via API:

```bash
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-custom-team",
    "description": "Custom team for Python development",
    "planner": {
      "model": "claude-sonnet-4-6",
      "temperature": 0.7
    },
    "generator": {
      "model": "claude-sonnet-4-6",
      "temperature": 0.5
    },
    "evaluator": {
      "model": "gpt-4o",
      "passThreshold": 7
    }
  }'
```

### Team Configuration Options

| Parameter | Description | Options |
|-----------|-------------|---------|
| `model` | LLM model to use | Any supported model |
| `temperature` | Sampling temperature | 0.0 - 2.0 |
| `maxTokens` | Maximum output tokens | 1 - 200,000 |
| `passThreshold` | Score needed to pass | 1 - 10 |
| `maxRetries` | Max regeneration attempts | 1 - 10 |

### Using Team with Task

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a REST API",
    "teamConfig": {
      "planner": { "model": "claude-sonnet-4-6" },
      "generator": { "model": "claude-sonnet-4-6" },
      "evaluator": { "model": "gpt-4o" }
    }
  }'
```

### Model Fallback

Configure fallback models for resilience:

```json
{
  "name": "resilient-team",
  "planner": {
    "model": "claude-sonnet-4-6",
    "fallback": "gpt-4o"
  },
  "generator": {
    "model": "claude-sonnet-4-6",
    "fallback": "gpt-4o-mini"
  },
  "evaluator": {
    "model": "gpt-4o",
    "fallback": "gpt-4o-mini"
  }
}
```

---

## Next Steps

- [Examples](./examples.md) - Real-world use cases
- [API Reference](./api-reference.md) - Complete API documentation
- [Installation](./installation.md) - Setup guide
- [FAQ](./faq.md) - Common questions
