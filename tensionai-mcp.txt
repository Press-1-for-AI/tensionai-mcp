# TensionAI-MCP Server

FROM oven/bun:1.2.5-debian AS base
LABEL maintainer="dev@tensionai.com"
LABEL version="1.0.0"

# ============================================================================
# Dependencies Stage
# ============================================================================
FROM base AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# ============================================================================
# Builder Stage
# ============================================================================
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN bun build src/index.ts --outdir dist --target bun

# ============================================================================
# Production Stage
# ============================================================================
FROM oven/bun:1.2.5-debian AS runner

# Security: Run as non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy package files for production dependencies
COPY package.json bun.lock ./

# Install only production dependencies
RUN bun install --frozen-lockfile --production

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/shared ./shared

# Create required directories
RUN mkdir -p /app/logs /app/data /app/config

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# ============================================================================
# Expose Ports
# ============================================================================
EXPOSE 3000 9090

# ============================================================================
# Environment
# ============================================================================
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# ============================================================================
# Health Check
# ============================================================================
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bunx curl -f http://localhost:3000/health || exit 1

# ============================================================================
# Start Command
# ============================================================================
CMD ["bun", "run", "src/index.ts"]
