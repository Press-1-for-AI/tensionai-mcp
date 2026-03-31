# Frequently Asked Questions

Answers to common questions about the TensionAI Multi-Agent MCP Server.

## Table of Contents

- [General Questions](#general-questions)
- [Provider Questions](#provider-questions)
- [Configuration Questions](#configuration-questions)
- [Troubleshooting](#troubleshooting)
- [Performance](#performance)
- [Security](#security)

---

## General Questions

### What is the TensionAI Multi-Agent MCP Server?

The TensionAI Multi-Agent MCP Server is a production-grade system that extends the adversarial harness pattern — separating generation from evaluation and pitting them against each other. It uses a team of specialized agents (Planner, Generator, Evaluator) that collaborate to produce high-quality outputs through iterative refinement.

### How does the adversarial pattern work?

The system works as follows:

1. **Planner Agent** - Analyzes the task and creates a detailed execution plan
2. **Generator Agent** - Produces output based on the plan
3. **Evaluator Agent** - Critically reviews the output against requirements
4. **Loop** - Generator refines based on feedback until evaluator passes or max iterations reached

This approach produces higher quality outputs than single-pass generation.

### What makes it different from other MCP servers?

Key differentiators:
- **Adversarial Debate** - Multiple agents argue and refine
- **Quality Levels** - Fast/Standard/Deep for different use cases
- **Multi-Provider Support** - OpenAI, Anthropic, MiniMax, Gemini, local models
- **Resource Management** - Budget tracking, rate limiting, queue management
- **Project Memory** - Context persistence across tasks

### What programming languages are supported?

The server is built with TypeScript/Bun and provides:
- MCP protocol tools (language-agnostic)
- REST API (any HTTP client)
- WebSocket for real-time updates
- CLI client

### Can I use it without an API key?

Yes, by using local models (vllm or llama.cpp). See [Installation](./installation.md#local-model-setup) for setup instructions.

---

## Provider Questions

### Which LLM providers are supported?

| Provider | Environment Variable | Status |
|----------|---------------------|--------|
| OpenAI | `OPENAI_API_KEY` | ✅ Supported |
| Anthropic | `ANTHROPIC_API_KEY` | ✅ Supported |
| MiniMax | `MINIMAX_API_KEY` | ✅ Supported |
| Google Gemini | `GOOGLE_API_KEY` | ✅ Supported |
| Local (vllm) | `VLLM_BASE_URL` | ✅ Supported |
| Local (llama.cpp) | `LLAMA_CPP_URL` | ✅ Supported |

### Can I use multiple providers at once?

Yes! Configure multiple providers in your `.env` file:

```env
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
MINIMAX_API_KEY=xxx
```

The system will:
- Use primary provider by default
- Automatically fall back if primary fails
- Show provider health status in dashboard

### How does provider fallback work?

When a provider fails:
1. Circuit breaker opens after 5 consecutive failures
2. System switches to fallback provider
3. Primary provider is retried after 60 seconds
4. Metrics track provider reliability

### Which model should I use for each role?

| Role | Recommended Models | Rationale |
|------|-------------------|-----------|
| **Planner** | claude-sonnet-4-6, gpt-4o | Planning requires reasoning |
| **Generator** | claude-sonnet-4-6, gpt-4o | Generation needs creativity |
| **Evaluator** | gpt-4o, gpt-4o-mini | Evaluation needs consistency |

### Can I use different models for different tasks?

Yes, specify per-task overrides:

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build an API",
    "teamConfig": {
      "planner": { "model": "claude-sonnet-4-6" },
      "generator": { "model": "gpt-4o" },
      "evaluator": { "model": "gpt-4o-mini" }
    }
  }'
```

---

## Configuration Questions

### How do I configure quality levels?

Quality levels are set per-task or auto-detected:

```bash
# Manual setting
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Fix this bug",
    "qualityLevel": "fast"
  }'
```

| Level | Tokens | Duration | Best For |
|-------|--------|----------|----------|
| fast | 10,000 | 60s | Quick fixes |
| standard | 50,000 | 5min | Feature work |
| deep | 200,000 | 30min | Complex systems |

### How do I create custom agent teams?

```bash
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-team",
    "planner": { "model": "claude-sonnet-4-6" },
    "generator": { "model": "gpt-4o" },
    "evaluator": { "model": "gpt-4o", "passThreshold": 7 }
  }'
```

### How do I configure budgets?

Per-task budget:
```json
{
  "budget": {
    "maxTokens": 10000,
    "maxDurationMs": 120000,
    "maxCostUsd": 0.25
  }
}
```

Per-project budget:
```bash
curl -X POST http://localhost:3000/api/budgets \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-project",
    "maxCostUsd": 10.00,
    "period": "daily"
  }'
```

### How do I set up memory persistence?

Configure memory backend in environment:

```env
# Options: local, openmemory, cognee, mem0
MEMORY_PROVIDER=local
```

Then use memory endpoints:
```bash
# Write
curl -X POST http://localhost:3000/api/memory/my-project \
  -d '{ "content": "Architecture decision..." }'

# Search
curl http://localhost:3000/api/memory/my-project?query=architecture
```

### How do I enable tie-breaker for deadlocks?

Set environment variable:
```env
ENABLE_TIEBREAKER=true
```

When agents deadlock, the system will:
1. Notify via WebSocket
2. Present options to human
3. Use human decision to break tie

---

## Troubleshooting

### Server won't start

**Symptoms**: Port already in use error

**Solutions**:
```bash
# Check what's using port 3000
netstat -ano | findstr :3000

# Use different port
PORT=3001 bun run dev
```

### Tasks queue but don't execute

**Possible causes**:
1. No API key configured
2. Rate limit exceeded
3. Budget exhausted
4. All providers unavailable

**Diagnostics**:
```bash
# Check provider health
curl http://localhost:3000/api/providers/health

# Check queue status
curl http://localhost:3000/api/queue/status

# Check budget
curl http://localhost:3000/api/budgets/my-project
```

### "Provider not available" error

**Solutions**:
```bash
# Verify API key
echo $OPENAI_API_KEY

# Test direct API access
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check server logs
tail -f logs/server.log
```

### Out of memory errors

**Solutions**:
- Reduce task complexity
- Use smaller models (gpt-4o-mini)
- Reduce quality level
- For Docker, increase container memory

### WebSocket connection fails

**Solutions**:
```javascript
// Add reconnection logic
const ws = new WebSocket('ws://localhost:3000/api/ws/tasks/...');
ws.onclose = () => {
  setTimeout(() => reconnect(), 5000);
};
```

### Local model won't connect

**Check vllm**:
```bash
curl http://localhost:8000/v1/models
```

**Check Docker networking**:
```yaml
# Use host network
services:
  mcp-server:
    network_mode: host
```

---

## Performance

### How fast is the system?

| Quality Level | Typical Duration | Factors |
|---------------|------------------|----------|
| Fast | 30-60 seconds | Model speed, task complexity |
| Standard | 2-5 minutes | Debate rounds, model speed |
| Deep | 10-30 minutes | Thorough evaluation, iterations |

### How much does it cost?

Cost depends on providers and models used:

| Model | Input (per 1M) | Output (per 1M) | Typical Task |
|-------|----------------|-----------------|--------------|
| gpt-4o-mini | $0.15 | $0.60 | $0.01-0.05 |
| gpt-4o | $5.00 | $15.00 | $0.10-0.50 |
| claude-sonnet-4-6 | $3.00 | $15.00 | $0.10-0.40 |

### How to optimize for speed?

1. Use `fast` quality level for simple tasks
2. Use gpt-4o-mini for evaluator
3. Enable caching for repeated queries
4. Use local models for development

### How to optimize for cost?

1. Set per-task budgets
2. Use gpt-4o-mini where possible
3. Configure fallback to cheaper providers
4. Monitor usage with dashboard

### What's the maximum throughput?

Depends on:
- API provider rate limits
- Model speed
- Task complexity

Typical limits:
- 10-20 concurrent tasks
- 100+ tasks/minute for simple queries

---

## Security

### How are API keys stored?

API keys are:
- Stored in environment variables (not in code)
- Passed to Docker at runtime
- Not logged or exposed in errors

### Is project data isolated?

Yes. Each project has:
- Isolated memory namespace
- Separate task history
- Independent budget tracking

### Can I restrict access?

Yes, configure API keys:
```env
API_KEYS=key1,key2,key3
```

Then use in requests:
```bash
curl -H "Authorization: Bearer key1" \
  http://localhost:3000/api/tasks
```

### Is there audit logging?

Yes, all tasks are logged with:
- User/API key identification
- Timestamp
- Input/output summary
- Cost tracking

### Can local models be exposed externally?

No. When using local models:
- Use Docker host network only
- Don't expose vllm/llama.cpp ports externally
- Local models are for internal use only

---

## Getting More Help

### Where can I find more documentation?

- [Installation Guide](./installation.md)
- [Usage Guide](./usage.md)
- [Examples](./examples.md)
- [API Reference](./api-reference.md)
- [Technical Proposal](./technical-proposal.md)

### How do I report bugs?

Check the GitHub issues and create a new issue with:
- Reproduction steps
- Environment details
- Server logs
- Expected vs actual behavior

### Can I contribute?

Yes! See the repository for contribution guidelines.

### What's the license?

Check the LICENSE file in the repository.
