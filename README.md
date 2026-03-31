# TensionAI-MCP

A GAN-inspired three-agent harness that separates **planning**, **building**, and **evaluation** into distinct AI agents with distinct contexts. The evaluator's job is to **break** what the generator builds -- creating adversarial tension that drives quality far beyond what a single agent can achieve.

Based on Anthropic's engineering article: [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## What This Demonstrates

Most AI coding agents fail on complex tasks not because the model is bad, but because nobody separated the work into specialized roles. A single agent that plans, builds, and evaluates its own work will reliably praise its own mediocre output. This is called **self-evaluation bias**, and it's the quiet killer of ambitious AI coding projects.

This project implements the fix: three agents, each with a focused job and its own context window.

| Agent | Role | Analogy |
|-------|------|---------|
| **Planner** | Expands a short prompt into a full product spec with sprints | Product manager |
| **Generator** | Builds one feature at a time, commits to git | Software engineer |
| **Evaluator** | Actively tries to break what the generator built, scores ruthlessly | Adversarial QA |

The evaluator doesn't just review code -- it's an adversary. It runs the application, probes for failures, tests edge cases the generator didn't think of, and scores each criterion on a 1-10 scale with a hard pass threshold. If any criterion fails, the sprint goes back to the generator with detailed, unforgiving feedback. The generator has to fight its way past the evaluator to advance. This adversarial pressure is what turns AI-generated code from "looks right" into "actually works."

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime installed
- At least one LLM provider API key (OpenAI, Anthropic, MiniMax, or Gemini)

### Install

```bash
git clone https://github.com/Press-1-for-AI/tensionai-mcp.git
cd tensionai-mcp
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your API keys
```

### Run the MCP Server

```bash
# For IDE integration (Cursor, Claude Desktop, Roo Code)
bun run mcp

# Or for REST API server
bun run dev
```

### IDE Integration

Copy the appropriate config to your IDE:

- **Roo Code**: `mcp-servers/roo-code.json`
- **Cursor**: `mcp-servers/cursor.json`
- **Claude Desktop**: `mcp-servers/claude-desktop.json`

## Architecture

```
User Prompt (1-4 sentences)
         |
         v
   +-----------+
   |  PLANNER  |  --> writes spec.md (features, sprints, design language)
   +-----------+
         |
         v  (for each sprint)
   +---------------------+
   | CONTRACT NEGOTIATION |  Generator proposes criteria,
   | Generator <-> Eval   |  Evaluator tightens the screws,
   +---------------------+  both lock in "done"
         |
         v
   +-----------+     fail + feedback     +------------+
   | GENERATOR | <---------------------- | EVALUATOR  |
   | (build)   | ----------------------> | (attack)   |
   +-----------+     implementation      +------------+
         |                                      |
         v              pass                    |
     Next Sprint <-------------------------------+
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `adversarial_execute` | Execute a task with adversarial agents |
| `adversarial_status` | Get task status |
| `adversarial_abort` | Abort a running task |
| `adversarial_list_tasks` | List all tasks |
| `memory_search` | Search project memory |
| `memory_write` | Write to project memory |
| `memory_purge` | Purge project memory |

## Configuration

Defaults are in `shared/config.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxSprints` | 10 | Maximum number of sprints |
| `maxRetriesPerSprint` | 3 | Max evaluation retries before failing a sprint |
| `passThreshold` | 7 | Minimum score (out of 10) for each criterion |

## How It Works

When you run a task, here's what happens step by step:

### 1. Planning Phase
The planner takes your short prompt and generates a comprehensive product specification with features organized into sprints, a design language, and tech stack decisions. This spec is written to `spec.md`.

### 2. Contract Negotiation (per sprint)
The generator proposes what it will build and how success should be measured. The evaluator reviews the criteria, making them more specific, adding edge cases, and raising the bar. They iterate until locked in. The contract is saved as JSON.

### 3. Build Phase (per sprint)
The generator reads the spec and contract, then implements features one at a time with git commits after each. It has full access to create files, run commands, install dependencies, and test code.

### 4. Evaluation Phase (per sprint)
The evaluator reads the contract criteria, examines the code, **runs the application**, and tries to break it. It scores each criterion on a 1-10 scale. If all criteria pass (score >= 7/10), the sprint survives. If any fail, detailed feedback goes back to the generator -- with file paths, line numbers, and exact failure descriptions.

### 5. Retry Loop
The generator reads the adversarial feedback, decides whether to refine or pivot, and rebuilds. This cycles up to 3 times per sprint. If a sprint can't survive the evaluator after all retries, the harness stops.

### 6. Completion
Once all sprints pass, you have a working application built incrementally with quality gates at every step -- every feature tested by an agent whose job was to break it.

## The GAN Connection

This architecture is inspired by **Generative Adversarial Networks** (GANs), where a generator creates outputs and a discriminator tries to reject them, iterating until quality emerges from the tension between the two.

| GANs | This Harness |
|------|---------------|
| Generator vs. discriminator | **Generator vs. evaluator** |
| Gradient descent | **Hard pass/fail thresholds** |
| Two networks | **Three agents** (adds planner) |
| Continuous training | **Sprint-based iteration** |
| Zero-sum game | **Asymmetric adversarial** -- evaluator tries to break, generator tries to survive |

The core insight is the same: **separate generation from evaluation, then pit them against each other**. A generator that evaluates its own work converges on mediocrity. A separate evaluator with the explicit mandate to find failures creates the adversarial pressure that forces quality upward. The generator doesn't just build -- it builds knowing an adversary is waiting.

## Why This Is the Future of AI Coding

We're at an inflection point. In 2025, the focus was on making individual agents smarter. In 2026, the focus has shifted to **harness design** -- the scaffolding around agents that makes them reliable.

Here's the key principle from Anthropic's article:

> "Every component in a harness encodes an assumption about what the model can't do on its own."

As models improve, harnesses simplify. When Opus 4.5 shipped, Anthropic removed context resets from their harness because the model could maintain coherence natively. When Opus 4.6 shipped with 1M tokens, they removed sprint decomposition entirely because the model could sustain coherent work across two-hour builds.

But the frontier doesn't shrink -- it moves. Better models make previous scaffolding unnecessary while opening new possibilities for harnesses that achieve more complex tasks. The **pattern** of separating planning, building, and evaluation is durable even as the implementation details evolve.

Two principles that matter most:
1. **Separate evaluation from generation.** Don't let the agent grade its own homework.
2. **Define "done" before you start.** Sprint contracts are how you turn vibing into engineering.

## Project Structure

```
tensionai-mcp/
├── mcp-servers/           # IDE MCP configurations
│   ├── roo-code.json
│   ├── cursor.json
│   └── claude-desktop.json
├── src/
│   ├── index.ts           # REST API server entry point
│   ├── mcp/
│   │   ├── server.ts      # MCP server logic
│   │   └── stdio.ts       # MCP stdio server (for IDEs)
│   ├── api/               # REST API server
│   ├── orchestrator/      # Agent orchestration
│   ├── providers/         # LLM provider integrations
│   ├── memory/            # Memory service
│   └── ...
├── docs/                  # Documentation
├── tests/
│   └── e2e/              # E2E tests
└── docker-compose.yml    # Docker deployment
```

## Documentation

- [Getting Started](docs/getting-started.md) - Quick start guide
- [Usage Guide](docs/usage.md) - Detailed usage instructions
- [API Reference](docs/api-reference.md) - REST API documentation
- [MCP Tools](docs/mcp-tools.md) - Tool-specific documentation
- [Installation](docs/installation.md) - Full installation guide
- [Examples](docs/examples.md) - Real-world examples

## Docker Deployment

```bash
# Build and run
docker build -t tensionai-mcp .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... tensionai-mcp

# Or use docker-compose for full stack
docker-compose up -d
```

## License

MIT
