# Examples

Real-world examples demonstrating the TensionAI Multi-Agent MCP Server capabilities.

## Table of Contents

- [Code Generation Example](#code-generation-example)
- [Writing/Research Example](#writingresearch-example)
- [Custom Team Configuration](#custom-team-configuration)
- [Budget Configuration](#budget-configuration)
- [Memory Usage](#memory-usage)
- [Multimedia Processing](#multimedia-processing)

---

## Code Generation Example

### Scenario

Build a complete REST API for a task management application with authentication, CRUD operations, and error handling.

### Request

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a REST API for task management with Express.js. Include: user authentication with JWT, CRUD operations for tasks, input validation, error handling, and unit tests. Use PostgreSQL for storage.",
    "qualityLevel": "deep",
    "projectId": "task-api-project",
    "maxSprints": 15
  }'
```

### Expected Debate Flow

```
Round 1 - Planner:
  "This task requires:
   1. Express.js server setup
   2. JWT authentication middleware
   3. Task CRUD endpoints
   4. Zod validation schemas
   5. Error handling middleware
   6. PostgreSQL integration with Drizzle ORM
   7. Unit tests with Vitest"

Round 1 - Generator:
  [Generates initial implementation]

Round 1 - Evaluator:
  Score: 6/10
  Feedback: "Missing input validation for task creation. 
   Add Zod schema for task fields."

Round 2 - Generator:
  [Fixes validation issues]

Round 2 - Evaluator:
  Score: 8/10
  Feedback: "Good. Now add rate limiting to prevent abuse."

[... additional rounds ...]

Final Round - Evaluator:
  Score: 9/10
  Feedback: "Complete implementation with tests passing."
```

### Result Structure

```json
{
  "id": "task-uuid-xxxxx",
  "status": "completed",
  "output": {
    "files": [
      "src/index.ts",
      "src/routes/tasks.ts",
      "src/middleware/auth.ts",
      "src/lib/db.ts",
      "src/schemas/task.ts",
      "tests/tasks.test.ts"
    ],
    "summary": "Complete REST API implementation..."
  },
  "metrics": {
    "durationMs": 180000,
    "totalSprints": 12,
    "tokenUsage": { "input": 45000, "output": 12000 },
    "costUsd": 1.85
  }
}
```

### CLI Equivalent

```bash
bun run cli execute "Build a REST API for task management" \
  --quality deep \
  --project task-api-project \
  --stream
```

---

## Writing/Research Example

### Scenario

Research and write a comprehensive report on the best practices for scaling Node.js applications.

### Request

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Research best practices for scaling Node.js applications to handle 10,000+ concurrent connections. Include benchmarks, code examples, and architecture diagrams.",
    "qualityLevel": "standard",
    "projectId": "scaling-research",
    "teamConfig": {
      "planner": { "model": "claude-sonnet-4-6" },
      "generator": { "model": "claude-sonnet-4-6" },
      "evaluator": { "model": "gpt-4o" }
    }
  }'
```

### Expected Output Structure

```markdown
# Scaling Node.js Applications: Best Practices

## Executive Summary
High-level overview of the challenges and solutions...

## 1. Event Loop Architecture
Understanding how Node.js handles async operations...

### 1.1 Event Loop Phases
- Timers phase
- Pending callbacks phase
- Idle, prepare
- Poll phase
- Check phase
- Close callbacks

### Code Example: Non-blocking I/O
```javascript
const fs = require('fs').promises;
// Use async/await for non-blocking operations
async function readData() {
  const data = await fs.readFile('./large-file.txt', 'utf8');
  return processData(data);
}
```

## 2. Cluster Module
...

## 3. Load Balancing
...

## 4. Caching Strategies
...
```

### Using Memory for Context

```bash
# Save research findings to memory
curl -X POST http://localhost:3000/api/memory/scaling-research \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Node.js scaling best practices: 1) Use cluster module, 2) Implement Redis caching, 3) Use PM2 for process management, 4) Optimize database queries with connection pooling",
    "metadata": { "source": "task-123", "tags": ["scaling", "nodejs", "performance"] }
  }'

# Use memory in next task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Apply the scaling best practices to optimize our Express API",
    "projectId": "scaling-research"
  }'
```

---

## Custom Team Configuration

### Scenario

Create a specialized team for Python development with specific model preferences.

### Step 1: Create Custom Team

```bash
curl -X POST http://localhost:3000/api/teams \
  -H "Content-Type: application/json" \
  -d '{
    "name": "python-dev-team",
    "description": "Specialized team for Python development",
    "planner": {
      "model": "claude-sonnet-4-6",
      "temperature": 0.7,
      "systemPrompt": "You are a Python architect specializing in clean code and PEP 8 compliance."
    },
    "generator": {
      "model": "claude-sonnet-4-6",
      "temperature": 0.5,
      "maxTokens": 10000,
      "systemPrompt": "You generate production-quality Python code with type hints and docstrings."
    },
    "evaluator": {
      "model": "gpt-4o",
      "passThreshold": 8,
      "systemPrompt": "You evaluate Python code for correctness, performance, and best practices."
    }
  }'
```

### Step 2: Use Custom Team

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a Python class for managing a thread-safe cache",
    "teamId": "python-dev-team-id"
  }'
```

### Team with Fallback

```json
{
  "name": "resilient-python-team",
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

### Preset Teams Reference

| Preset | Use Case | Models |
|--------|----------|--------|
| `fast` | Quick prototypes | gpt-4o-mini all roles |
| `balanced` | General development | gpt-4o all roles |
| `thorough` | Complex systems | claude-opus-4-5 all roles |
| `cost-effective` | Budget-conscious | gpt-4o-mini + gpt-4o |

---

## Budget Configuration

### Scenario

Set budget constraints for a team to control costs while maintaining quality.

### Per-Task Budget

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a login form",
    "budget": {
      "maxTokens": 5000,
      "maxDurationMs": 60000,
      "maxCostUsd": 0.10
    }
  }'
```

### Per-Project Budget

```bash
# Set project budget
curl -X POST http://localhost:3000/api/budgets \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-project",
    "maxTokensPerTask": 10000,
    "maxCostUsd": 0.50,
    "period": "daily",
    "maxTasksPerDay": 50
  }'
```

### Budget Tracking

```bash
# Check current budget usage
curl http://localhost:3000/api/budgets/my-project

# Response
{
  "projectId": "my-project",
  "period": "daily",
  "limit": 0.50,
  "spent": 0.32,
  "remaining": 0.18,
  "tasksUsed": 12,
  "tasksRemaining": 38,
  "resetsAt": "2026-03-31T00:00:00Z"
}
```

### Budget Alerts

```bash
# Set up alert
curl -X POST http://localhost:3000/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "type": "budget_threshold",
    "projectId": "my-project",
    "threshold": 0.80,
    "action": "notify",
    "channels": ["webhook", "email"]
  }'
```

### Cost Configuration

Customize provider rates for accurate tracking:

```json
{
  "provider_rates": {
    "openai": {
      "gpt-4o": { "input": 0.005, "output": 0.015 },
      "gpt-4o-mini": { "input": 0.00015, "output": 0.0006 }
    },
    "anthropic": {
      "claude-sonnet-4-6": { "input": 0.003, "output": 0.015 }
    }
  }
}
```

---

## Memory Usage

### Scenario

Use project memory to maintain context across multiple tasks.

### Writing to Memory

```bash
# Write architecture decision
curl -X POST http://localhost:3000/api/memory/my-project \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Architecture decision: Use PostgreSQL with Drizzle ORM for all data persistence. Use Redis for session caching.",
    "metadata": {
      "type": "adr",
      "id": "ADR-001",
      "source": "initial-design",
      "tags": ["database", "architecture"]
    }
  }'
```

### Searching Memory

```bash
# Search by query
curl "http://localhost:3000/api/memory/my-project?query=database+orm"

# Search by metadata
curl "http://localhost:3000/api/memory/my-project?tag=architecture"
```

### Response with Context

```json
{
  "results": [
    {
      "id": "mem-uuid-1",
      "content": "Architecture decision: Use PostgreSQL with Drizzle ORM...",
      "metadata": {
        "type": "adr",
        "id": "ADR-001"
      },
      "relevance": 0.95,
      "createdAt": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 1
}
```

### Using Memory in Tasks

```bash
# Task that uses memory context
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create the database schema following our architecture decisions",
    "projectId": "my-project",
    "includeMemory": true
  }'
```

### Memory Backends

Configure different memory backends:

```env
# Local PostgreSQL (default)
MEMORY_PROVIDER=local

# OpenMemory
OPENMEMORY_API_KEY=xxx
MEMORY_PROVIDER=openmemory

# Cognee (graph-based)
COGNEE_API_KEY=xxx
MEMORY_PROVIDER=cognee

# Mem0
MEM0_API_KEY=xxx
MEMORY_PROVIDER=mem0
```

### Purging Memory

```bash
# Purge specific project
curl -X DELETE http://localhost:3000/api/memory/my-project

# Purge by age
curl -X DELETE "http://localhost:3000/api/memory/my-project?older_than=30d"
```

---

## Multimedia Processing

### Scenario

Process audio, images, and video with adversarial quality review.

### Audio Transcription

```bash
# Transcribe audio with adversarial review
curl -X POST http://localhost:3000/api/media/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "mediaUrl": "https://example.com/podcast-ep1.mp3",
    "language": "en",
    "adversarialReview": true
  }'
```

### Response

```json
{
  "text": "Welcome to the podcast. Today we're discussing...",
  "segments": [
    { "start": 0.0, "end": 5.5, "text": "Welcome to the podcast." },
    { "start": 5.5, "end": 12.3, "text": "Today we're discussing AI systems." }
  ],
  "confidence": 0.94,
  "evaluatorScore": 8,
  "evaluatorFeedback": "Transcription accurate. Minor punctuation issues in segment 3."
}
```

### Image Description

```bash
curl -X POST http://localhost:3000/api/media/describe \
  -H "Content-Type: application/json" \
  -d '{
    "mediaUrl": "https://example.com/diagram.png",
    "detailLevel": "high"
  }'
```

### Response

```json
{
  "description": "A flowchart showing a three-stage process...",
  "entities": [
    { "type": "box", "label": "Input" },
    { "type": "box", "label": "Processing" },
    { "type": "box", "label": "Output" }
  ],
  "evaluatorScore": 9,
  "evaluatorFeedback": "Excellent description. All entities identified correctly."
}
```

### Video Analysis

```bash
curl -X POST http://localhost:3000/api/media/analyze-video \
  -H "Content-Type: application/json" \
  -d '{
    "mediaUrl": "https://example.com/demo.mp4",
    "startTime": 0,
    "endTime": 30,
    "frameInterval": 5
  }'
```

### Response

```json
{
  "summary": "Software demo showing user interface...",
  "keyframes": [
    { "timestamp": 0, "description": "Landing page" },
    { "timestamp": 10, "description": "Login form" },
    { "timestamp": 20, "description": "Dashboard" }
  ],
  "transcript": "This demo shows how to use our platform...",
  "evaluatorScore": 8,
  "evaluatorFeedback": "Good analysis. Key moments captured."
}
```

### MCP Tool Usage

```json
{
  "name": "adversarial_execute_multimodal",
  "arguments": {
    "task": "Transcribe this meeting recording",
    "media_url": "https://example.com/meeting.mp3",
    "media_type": "audio",
    "quality_level": "standard"
  }
}
```

---

## Advanced Examples

### Batch Processing

```bash
# Process multiple tasks in parallel
curl -X POST http://localhost:3000/api/tasks/batch \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      { "prompt": "Create a login function", "qualityLevel": "fast" },
      { "prompt": "Create a logout function", "qualityLevel": "fast" },
      { "prompt": "Create password reset", "qualityLevel": "fast" }
    ]
  }'
```

### Streaming Output

```javascript
// Using fetch with streaming
const response = await fetch('http://localhost:3000/api/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "Write a complex algorithm",
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```

### WebSocket Real-Time Updates

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/tasks/task-id/debate');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'task.started':
      console.log('Task started:', data.taskId);
      break;
    case 'debate.message':
      console.log(`${data.agent}: ${data.content}`);
      break;
    case 'debate.score':
      console.log(`Score: ${data.scores[0].score}/${data.scores[0].threshold}`);
      break;
    case 'task.completed':
      console.log('Task completed:', data.output);
      break;
  }
};
```

---

## Next Steps

- [Installation](./installation.md) - Set up your environment
- [Usage Guide](./usage.md) - Detailed usage instructions
- [API Reference](./api-reference.md) - Complete API documentation
- [FAQ](./faq.md) - Common questions answered
