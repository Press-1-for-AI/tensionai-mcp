/**
 * TensionAI Multi-Agent MCP Server - Main Entry Point
 * 
 * This is the main entry point for the Phase 7 Docker & Deployment implementation.
 * It initializes:
 * 1. Production logging with Pino
 * 2. Provider pool (OpenAI, Anthropic, MiniMax, Gemini, Local)
 * 3. Agent orchestrator (Planner/Generator/Evaluator)
 * 4. MCP server
 * 5. REST API server
 * 6. Health check endpoints
 * 7. Graceful shutdown handling
 */

import { createAPIServer } from "./api/index.js";
import { initializeProviders, getHealthMonitor } from "./providers/index.js";
import { logger, setLogLevel } from "../shared/logger.js";

// ============================================================================
// Configuration
// ============================================================================

const config = {
  port: parseInt(process.env.PORT ?? "3000"),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  metrics: {
    enabled: process.env.METRICS_ENABLED === "true",
    port: parseInt(process.env.METRICS_PORT ?? "9090"),
  },
};

// Store server instance for graceful shutdown
let apiServer: Awaited<ReturnType<typeof createAPIServer>> | null = null;

// ============================================================================
// Startup Checks
// ============================================================================

interface StartupCheck {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
}

/**
 * Run all startup checks
 */
async function runStartupChecks(): Promise<boolean> {
  logger.info("Running startup checks...");
  
  const checks: StartupCheck[] = [
    {
      name: "Environment Variables",
      check: async () => {
        const required = ["NODE_ENV"];
        const missing = required.filter((key) => !process.env[key]);
        if (missing.length > 0) {
          logger.warn({ missing }, "Missing recommended environment variables");
        }
        return true;
      },
      critical: false,
    },
    {
      name: "Providers Configuration",
      check: async () => {
        const apiKeys = [
          { key: "OPENAI_API_KEY", provider: "openai" },
          { key: "ANTHROPIC_API_KEY", provider: "anthropic" },
          { key: "MINIMAX_API_KEY", provider: "minimax" },
          { key: "GOOGLE_API_KEY", provider: "gemini" },
        ];
        
        const available = apiKeys
          .filter((k) => process.env[k.key])
          .map((k) => k.provider);
        
        if (available.length === 0) {
          logger.warn("No LLM providers configured - server will run in limited mode");
        } else {
          logger.info({ providers: available }, "Configured providers");
        }
        return true;
      },
      critical: false,
    },
    {
      name: "Database Connection",
      check: async () => {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
          logger.warn("DATABASE_URL not set - database features disabled");
          return true; // Not critical for startup
        }
        // In production, we'd verify the connection here
        return true;
      },
      critical: false,
    },
    {
      name: "Redis Connection",
      check: async () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          logger.warn("REDIS_URL not set - caching features disabled");
          return true;
        }
        // In production, we'd verify the connection here
        return true;
      },
      critical: false,
    },
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    try {
      const passed = await check.check();
      if (passed) {
        logger.debug({ check: check.name }, "Check passed");
      } else {
        logger.error({ check: check.name }, "Check failed");
        if (check.critical) {
          allPassed = false;
        }
      }
    } catch (error) {
      logger.error({ check: check.name, error: (error as Error).message }, "Check error");
      if (check.critical) {
        allPassed = false;
      }
    }
  }
  
  if (allPassed) {
    logger.info("All startup checks completed");
  } else {
    logger.error("Some critical startup checks failed");
  }
  
  return allPassed;
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  // Set log level from environment
  const logLevel = process.env.LOG_LEVEL ?? (config.nodeEnv === "production" ? "info" : "debug");
  setLogLevel(logLevel);
  
  logger.info({
    version: "1.0.0",
    environment: config.nodeEnv,
    port: config.port,
    host: config.host,
  }, "Starting TensionAI Multi-Agent MCP Server");
  
  // Run startup checks
  const startupOk = await runStartupChecks();
  if (!startupOk && config.nodeEnv === "production") {
    logger.error("Critical startup checks failed in production - exiting");
    process.exit(1);
  }
  
  // Initialize providers (will only initialize those with API keys)
  logger.info("Initializing LLM providers...");
  try {
    const pool = initializeProviders({
      defaultProvider: "anthropic",
      fallbackChain: ["openai", "minimax"],
    });
    
    // Start health monitoring
    const healthMonitor = getHealthMonitor();
    healthMonitor.start();
    
    const available = await pool.getAvailableProviders();
    logger.info({ available }, "Provider initialization complete");
  } catch (error) {
    logger.warn({ error: (error as Error).message }, "Provider initialization warning");
  }
  
  // Create and start API server
  logger.info({ port: config.port, host: config.host }, "Starting REST API server");
  
  apiServer = createAPIServer({ port: config.port, host: config.host });
  await apiServer.start();
  
  logger.info("Server is ready");
  
  // Log available endpoints
  if (config.nodeEnv !== "production") {
    logger.info("Available endpoints:");
    logger.info("  GET  /health           - Health check");
    logger.info("  GET  /api/tools        - List MCP tools");
    logger.info("  GET  /api/info         - Server info");
    logger.info("  GET  /api/tasks        - List tasks");
    logger.info("  POST /api/tasks        - Create new task");
    logger.info("  GET  /api/tasks/:id    - Get task details");
    logger.info("  DELETE /api/tasks/:id  - Abort task");
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Initiating graceful shutdown...");
  
  // Stop accepting new connections
  if (apiServer) {
    logger.info("Closing API server...");
    try {
      await apiServer.stop();
      logger.info("API server closed");
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Error closing API server");
    }
  }
  
  // Stop health monitoring
  try {
    const healthMonitor = getHealthMonitor();
    healthMonitor.stop();
    logger.info("Health monitor stopped");
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Error stopping health monitor");
  }
  
  // Flush logs
  logger.info("Shutdown complete");
  
  // Exit
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", () => {
  logger.info("Received SIGINT");
  shutdown("SIGINT").catch((error) => {
    logger.error({ error: (error as Error).message }, "Error during shutdown");
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM");
  shutdown("SIGTERM").catch((error) => {
    logger.error({ error: (error as Error).message }, "Error during shutdown");
    process.exit(1);
  });
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error({ error: error.message, stack: error.stack }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  process.exit(1);
});

// ============================================================================
// Start Server
// ============================================================================

main().catch((error) => {
  logger.fatal({ error: error.message, stack: error.stack }, "Fatal error during startup");
  process.exit(1);
});
