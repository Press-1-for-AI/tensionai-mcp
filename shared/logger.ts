/**
 * Production Logger - Pino-based structured logging
 * 
 * Provides structured JSON logging for production with appropriate
 * log levels, formatting, and output destinations.
 */

import pino from "pino";

// ============================================================================
// Logger Configuration
// ============================================================================

interface LoggerConfig {
  level: string;
  prettyPrint: boolean;
  colorize: boolean;
  timestamp: boolean;
}

// Get log level from environment
function getLogLevel(): string {
  const env = process.env.NODE_ENV ?? "development";
  const level = process.env.LOG_LEVEL ?? "info";
  
  // In production, use the configured level
  if (env === "production") {
    return level;
  }
  
  // In development, allow override but default to debug
  return process.env.LOG_LEVEL ?? "debug";
}

// Determine if we should use pretty printing
function shouldUsePrettyPrint(): boolean {
  const env = process.env.NODE_ENV ?? "development";
  return env !== "production";
}

// Create logger configuration
const loggerConfig: LoggerConfig = {
  level: getLogLevel(),
  prettyPrint: shouldUsePrettyPrint(),
  colorize: shouldUsePrettyPrint(),
  timestamp: true,
};

// ============================================================================
// Create Pino Logger
// ============================================================================

const logger = pino({
  level: loggerConfig.level,
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        service: "tensionai-mcp",
        ...bindings,
      };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  ...(loggerConfig.prettyPrint && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: loggerConfig.colorize,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
});

// ============================================================================
// Export Logger
// ============================================================================

export { logger };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Get the current log level
 */
export function getLogLevelCurrent(): string {
  return logger.level;
}

/**
 * Set the log level
 */
export function setLogLevel(level: string): void {
  logger.level = level;
}
