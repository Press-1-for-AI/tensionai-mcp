# TensionAI-MCP Setup & Configuration Guide

## Overview
This guide outlines the remaining configuration tasks needed to finalize your TensionAI-MCP project setup.

---

## 1. Email/Domain References

### Current Status: ✅ Already Updated
The `@tensionai.com` references are already in place:
- `Dockerfile` line 4: `LABEL maintainer="dev@tensionai.com"`
- `tensionai-mcp.txt` line 4: `LABEL maintainer="dev@tensionai.com"`

No action needed - these are correct.

---

## 2. Environment Configuration

### Create Your .env File
Copy `.env.example` to `.env` and configure:

```bash
# Required: At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-...      # For Claude models
# OR
OPENAI_API_KEY=sk-...            # For OpenAI models
# OR  
GOOGLE_API_KEY=...               # For Gemini models

# Optional: Database (defaults to SQLite)
DATABASE_URL=postgresql://user:pass@localhost:5432/tensionai

# Optional: Redis for queuing/caching
REDIS_URL=redis://localhost:6379

# Optional: Memory backend
MEMORY_BACKEND=local             # Options: local, cognee, mem0, openmemory

# Optional: OpenWebUI Integration
OPENWEBUI_URL=http://localhost:8080
OPENWEBUI_API_KEY=your-key-here

# Optional: Provider configs
MINIMAX_API_KEY=...
MINIMAX_GROUP_ID=...
```

---

## 3. MCP Server Configuration

### For Different IDEs
The `mcp-servers/` folder contains configurations for various IDEs. Copy the appropriate file to your IDE's MCP config location:

| IDE | Source File | Destination |
|-----|-------------|-------------|
| Roo Code | `mcp-servers/roo-code.json` | VS Code settings or Roo's MCP config |
| Cursor | `mcp-servers/cursor.json` | Cursor settings |
| Claude Desktop | `mcp-servers/claude-desktop.json` | Claude Desktop config |

Example for Roo Code:
```json
{
  "mcpServers": {
    "tensionai-mcp": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      },
      "description": "TensionAI Multi-Agent MCP Server"
    }
  }
}
```

---

## 4. Docker Setup

### Build the Docker Image
```bash
docker build -t tensionai-mcp .
```

### Run with Docker Compose
```bash
docker-compose up -d
```

This will start:
- MCP Server (port 3000)
- PostgreSQL (port 5432)
- Redis (port 6379)
- Prometheus (port 9090)
- Grafana (port 3001)

---

## 5. Local Development Setup

### Install Dependencies
```bash
bun install
```

### Run Development Server
```bash
bun run dev
```

### Run Tests
```bash
bun test
```

---

## 6. Dashboard Access

### Start Dashboard
The dashboard runs alongside the server at `http://localhost:3000`

### Grafana Monitoring
- URL: `http://localhost:3001`
- Default credentials: `admin` / `admin`
- Dashboard is pre-configured with TensionAI MCP Server metrics

---

## 7. Health Checks

### Run Health Check Script
```bash
bash scripts/health-check.sh
```

This verifies:
- PostgreSQL connectivity
- Redis connectivity  
- MCP server health endpoint
- Provider health status

---

## 8. Project Structure Reference

```
tensionai-mcp/
├── src/                    # Main application source
│   ├── index.ts           # Entry point
│   ├── api/               # REST API
│   ├── mcp/               # MCP protocol server
│   ├── orchestrator/      # Agent orchestration
│   ├── providers/         # LLM provider integrations
│   ├── memory/            # Memory service
│   └── ...
├── dashboard/             # Web dashboard
├── docs/                  # Documentation
├── mcp-servers/           # IDE MCP configurations
├── scripts/               # Utility scripts
├── claude-harness/        # Standalone Claude harness (from original)
└── codex-harness/         # Standalone Codex harness (from original)
```

---

## 9. Next Steps After Setup

1. **Configure at least one LLM provider** in your `.env` file
2. **Test the MCP server** by connecting it to your preferred IDE
3. **Explore the dashboard** to understand metrics and monitoring
4. **Review documentation** in `docs/` for advanced features:
   - `docs/getting-started.md` - Quick start guide
   - `docs/mcp-tools.md` - Available MCP tools
   - `docs/api-reference.md` - REST API documentation

---

## 10. Common Tasks

### Add a New LLM Provider
Edit `src/providers/index.ts` to add new provider support.

### Configure Memory Backend
Update `MEMORY_BACKEND` in `.env`:
- `local` - Simple file-based storage
- `cognee` - Graph-based memory
- `mem0` - Managed memory service
- `openmemory` - Open source memory

### Add Custom Agent Team Presets
Edit `src/teams/presets.ts` to define custom agent configurations.

---

## Support

For issues or questions, refer to:
- Documentation: `docs/`
- GitHub Issues: https://github.com/your-repo/tensionai-mcp/issues
- Email: dev@tensionai.com