# Installation Guide

Comprehensive installation and setup guide for the TensionAI Multi-Agent MCP Server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [API Key Configuration](#api-key-configuration)
- [Local Model Setup](#local-model-setup)
- [Docker Installation](#docker-installation)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| **Bun** | 1.0+ | Runtime for the MCP server | [bun.sh](https://bun.sh) |
| **Git** | Any recent version | Clone the repository | Pre-installed or [git-scm.com](https://git-scm.com) |

### Optional Software

| Software | Purpose | When Needed |
|----------|---------|-------------|
| **Docker** | Containerized deployment | Production or full-stack |
| **Docker Compose** | Orchestrate multi-container setup | Using PostgreSQL/Redis |
| **Node.js** | Alternative runtime | If not using Bun |
| **PostgreSQL** | Database with vector support | Production deployments |
| **Redis** | Caching and queue management | High-load scenarios |

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/tensionai-mcp.git
cd tensionai-mcp
```

### 2. Install Dependencies

```bash
# Using Bun (recommended)
bun install

# Using npm (alternative)
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your preferred text editor:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# Database (optional - uses in-memory if not configured)
DATABASE_URL=postgresql://user:password@localhost:5432/tensionai

# Redis (optional - uses in-memory queue if not configured)
REDIS_URL=redis://localhost:6379
```

---

## API Key Configuration

### Provider Options

The server supports multiple LLM providers. You need at least one.

| Provider | Environment Variable | Model Examples | Cost Tier |
|----------|---------------------|----------------|-----------|
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini | $$ |
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514, claude-opus-4-5 | $$$ |
| **MiniMax** | `MINIMAX_API_KEY` | abab6.5s-chat | $ |
| **Google Gemini** | `GOOGLE_API_KEY` | gemini-2.0-flash, gemini-pro | $$ |
| **Local (vllm)** | `VLLM_BASE_URL` | Any vllm-served model | Free |
| **Local (llama.cpp)** | `LLAMA_CPP_URL` | Any GGUF model | Free |

### Getting API Keys

#### OpenAI

1. Visit [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys
3. Create new secret key
4. Add funds to your account

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Anthropic

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys
3. Create new key
4. Add credits to your account

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx
```

#### MiniMax

1. Visit [platform.minimax.io](https://platform.minimax.io)
2. Create account and navigate to API
3. Generate API key

```env
MINIMAX_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

#### Google Gemini

1. Visit [aistudio.google.com](https://aistudio.google.com)
2. Go to API Keys in sidebar
3. Create new API key

```env
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxx
```

### Example .env Configuration

```env
# Required: At least one provider
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Additional providers (enables fallback)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx
MINIMAX_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=info

# Feature Flags
ENABLE_TIEBREAKER=true
AUTO_DETECT_QUALITY=true
```

---

## Local Model Setup

For offline or cost-free operation, you can run local models using vllm or llama.cpp.

### Option 1: vllm

vllm provides high-throughput inference for Hugging Face models.

#### Installation

```bash
# Using Docker (recommended)
docker run --gpus all -v ~/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --env TF_ENABLE_ONEDNN_OPTS=0 \
    vllm/vllm:latest \
    --host 0.0.0.0 \
    --dtype half \
    --enforce-eager \
    --model huggyllama/llama-7b
```

#### Environment Configuration

```env
VLLM_BASE_URL=http://localhost:8000
VLLM_MODEL=huggyllama/llama-7b
```

#### Common vllm Models

| Model | VRAM Required | Use Case |
|-------|---------------|----------|
| llama-7b | ~14GB | Development |
| llama-13b | ~26GB | Balanced |
| llama-70b | ~140GB | Production |
| mistral-7b | ~14GB | Fast development |
| mixtral-8x7b | ~45GB | High quality |

### Option 2: llama.cpp

llama.cpp provides CPU-based inference with optional GPU acceleration.

#### Installation

```bash
# Clone and build
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp
make
```

#### Start Server

```bash
# Download a model (e.g., Mistral 7B)
# Then run the server
./server -m models/mistral-7b-instruct-v0.2.Q4_K_M.gguf \
    -c 4096 \
    -tp 1 \
    --host 0.0.0.0 \
    --port 8080
```

#### Environment Configuration

```env
LLAMA_CPP_URL=http://localhost:8080
```

### Using Local Models

Once configured, local models are used automatically:

```bash
# Start the MCP server
bun run dev

# Verify local provider is available
curl http://localhost:3000/api/providers/health
```

Expected response showing local availability:

```json
{
  "providers": {
    "local-vllm": {
      "status": "available",
      "model": "llama-7b",
      "latencyMs": 150
    },
    "local-llamacpp": {
      "status": "available",
      "model": "mistral-7b",
      "latencyMs": 2000
    }
  }
}
```

---

## Docker Installation

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+ (for full stack)

### Quick Start

```bash
# Build the image
docker build -t tensionai-mcp .

# Run the container
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxx \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  tensionai-mcp
```

### Full Stack with Docker Compose

The included `docker-compose.yml` starts:

- MCP Server
- PostgreSQL (with vector extension)
- Redis (optional)
- Prometheus metrics
- Grafana dashboards

```bash
# Start full stack
docker-compose up -d

# View logs
docker-compose logs -f mcp-server

# Stop all services
docker-compose down
```

### Docker Configuration

#### Host Network Mode

For local LLM access, use host network mode:

```yaml
services:
  mcp-server:
    build: .
    network_mode: host
    environment:
      - VLLM_BASE_URL=http://localhost:8000
```

#### Environment File

Create `docker.env`:

```env
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
PORT=3000
LOG_LEVEL=info
```

Then run:

```bash
docker run -p 3000:3000 --env-file docker.env tensionai-mcp
```

### Production Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  mcp-server:
    image: tensionai-mcp:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:5432/tensionai
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

---

## Troubleshooting

### Common Issues

#### 1. "Provider not available" Error

**Symptom**: Tasks fail with provider unavailable error

**Solutions**:
```bash
# Verify API key is set
echo $OPENAI_API_KEY

# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check provider health
curl http://localhost:3000/api/providers/health
```

#### 2. Connection Refused on Port 3000

**Symptom**: `ECONNREFUSED 127.0.0.1:3000`

**Solutions**:
```bash
# Check if server is running
ps aux | grep bun

# Check server logs
tail -f logs/server.log

# Try starting on different port
PORT=3001 bun run dev
```

#### 3. Out of Memory Errors

**Symptom**: `RangeError: Invalid array length` or OOM crashes

**Solutions**:
- Reduce batch size in requests
- Use smaller models (gpt-4o-mini instead of gpt-4o)
- Enable swap space on system
- For Docker, increase container memory limit

#### 4. Local Model Connection Failed

**Symptom**: Cannot connect to vllm/llama.cpp

**Solutions**:
```bash
# Verify vllm is running
curl http://localhost:8000/v1/models

# Check Docker network
docker network ls

# Try host network mode
docker run --network host ...
```

#### 5. Rate Limiting Errors

**Symptom**: Tasks queue but don't execute

**Solutions**:
- Add multiple API keys for different providers
- Configure fallback providers
- Upgrade provider account for higher limits

### Diagnostic Commands

```bash
# Check server health
curl http://localhost:3000/health

# Get system metrics
curl http://localhost:3000/api/metrics

# View provider status
curl http://localhost:3000/api/providers

# Check queue status
curl http://localhost:3000/api/queue/status

# List recent tasks
curl http://localhost:3000/api/tasks?limit=10
```

### Getting Help

- Check the [Technical Proposal](./technical-proposal.md) for architecture details
- See [Usage Guide](./usage.md) for detailed instructions
- Review [Examples](./examples.md) for common use cases

---

## Next Steps

- [Usage Guide](./usage.md) - Start using the server
- [Examples](./examples.md) - See real-world examples
- [API Reference](./api-reference.md) - Detailed API documentation
- [Technical Proposal](./technical-proposal.md) - Architecture details
