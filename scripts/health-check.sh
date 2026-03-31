#!/usr/bin/env bash
# Health check script for TensionAI MCP Server stack
# Checks:
# 1. PostgreSQL connectivity
# 2. Redis connectivity
# 3. MCP server health endpoint
# 4. Provider health (via /api/providers)

set -euo pipefail

# Helper
function log {
  echo "[HealthCheck] $*"
}

# PostgreSQL
log "Checking PostgreSQL..."
if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  echo "PostgreSQL NOT healthy"
  exit 1
fi
log "PostgreSQL healthy"

# Redis
log "Checking Redis..."
if ! redis-cli -u "$REDIS_URL" ping | grep -q PONG; then
  echo "Redis NOT healthy"
  exit 1
fi
log "Redis healthy"

# MCP Server
log "Checking MCP server health endpoint..."
if ! curl -sf "$HOST:$PORT/health" >/dev/null; then
  echo "MCP server NOT healthy"
  exit 1
fi
log "MCP server healthy"

# Providers
log "Checking providers health..."
if ! curl -sf "$HOST:$PORT/api/providers" >/dev/null; then
  echo "Providers endpoint NOT healthy"
  exit 1
fi
log "Providers endpoint healthy"

log "All checks passed"
exit 0
