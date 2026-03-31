# Getting Started Guide

A quick start guide for the TensionAI Multi-Agent MCP Server.

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- Node.js 18+ (if not using Bun)
- At least one LLM provider API key:
  - OpenAI (`OPENAI_API_KEY`)
  - Anthropic (`ANTHROPIC_API_KEY`)
  - MiniMax (`MINIMAX_API_KEY`)
  - Google/Gemini (`GOOGLE_API_KEY`)

## Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/tensionai-mcp.git
cd tensionai-mcp

# Install dependencies
bun install
```

## Configuration

Copy the example environment file and configure your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required: At least one provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Additional providers
MINIMAX_API_KEY=...
GOOGLE_API_KEY=...

# Server configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
```

## Quick Start

### 1. Start the Server

```bash
# Development mode (with auto-reload)
bun run dev

# Production mode
bun run start
```

The server will start on `http://localhost:3000`.

### 2. Verify Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-30T...",
  "version": "1.0.0"
}
```

### 3. Execute Your First Task

```bash
# Via REST API
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a simple hello world function in Python",
    "qualityLevel": "fast",
    "maxSprints": 1
  }'
```

Or use the CLI client:

```bash
bun run src/cli/client.ts execute "Write a hello world function"
```

### 4. Check Task Status

```bash
# Replace TASK_ID with the ID from step 3
curl http://localhost:3000/api/tasks/TASK_ID
```

## MCP Tools

The server exposes these MCP tools:

| Tool | Description |
|------|-------------|
| `adversarial_execute` | Execute a task with adversarial agents |
| `adversarial_status` | Get task status |
| `adversarial_abort` | Abort a running task |
| `adversarial_list_tasks` | List all tasks |
| `memory_search` | Search project memory |
| `memory_write` | Write to project memory |
| `memory_purge` | Purge project memory |

## IDE Integration

### Roo Code

Copy `mcp-servers/roo-code.json` to your Roo Code configuration:

```json
{
  "mcpServers": {
    "tensionai-mcp": {
      "command": "bun",
      "args": ["run", "src/mcp/stdio.ts"]
    }
  }
}
```

### Cursor

Copy `mcp-servers/cursor.json` to your Cursor configuration.

### Claude Desktop

Copy `mcp-servers/claude-desktop.json` to your Claude Desktop configuration:
- macOS: `~/Library/Application Support/Claude/settings.json`
- Windows: `%APPDATA%/Claude/settings.json`

## Running the MCP Server

The MCP server runs as a stdio server - it communicates via stdin/stdout with your IDE.

```bash
# Option 1: Run directly
bun run mcp

# Option 2: Using npm script
npm run mcp

# Option 3: Manual
bun run src/mcp/stdio.ts
```

The server will start and wait for IDE connections. Your IDE will automatically detect and use the MCP tools.

## Docker Deployment

```bash
# Build and run with Docker
docker build -t tensionai-mcp .
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  tensionai-mcp

# Or use docker-compose
docker-compose up -d
```

## Docker Compose

See [`docker-compose.yml`](../docker-compose.yml) for a complete stack with:
- TensionAI MCP Server
- Prometheus metrics
- Grafana dashboards
- Redis caching (optional)
- PostgreSQL (optional)

```bash
docker-compose up -d
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/info` | GET | Server info |
| `/api/tasks` | POST | Create task |
| `/api/tasks` | GET | List tasks |
| `/api/tasks/:id` | GET | Get task |
| `/api/tasks/:id` | DELETE | Abort task |
| `/api/providers` | GET | List providers |
| `/api/providers/health` | GET | Provider health |
| `/api/metrics` | GET | Aggregate metrics |
| `/api/queue/status` | GET | Queue status |
| `/api/teams` | GET | List teams |
| `/api/memory/:projectId` | GET/POST | Memory CRUD |

## Quality Levels

| Level | Max Sprints | Max Retries | Use Case |
|-------|-------------|-------------|----------|
| `fast` | 3 | 1 | Quick prototyping |
| `standard` | 10 | 3 | General development |
| `deep` | 20 | 5 | Complex applications |

## Next Steps

- Read the [API Reference](api-reference.md) for detailed endpoint documentation
- See [MCP Tools](mcp-tools.md) for tool-specific usage
- Check [Technical Proposal](../docs/technical-proposal.md) for architecture details
