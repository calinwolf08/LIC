/**
 * Client-side Logger
 *
 * Initializes the logger with VITE_LOG_LEVEL from environment.
 * This file should only be imported in client-side code.
 *
 * Usage:
 *   import { clientLogger } from '$lib/utils/logger.client';
 *   clientLogger.info('Component mounted');
 *
 * Environment:
 *   VITE_LOG_LEVEL=DEBUG  # Set in .env (must have VITE_ prefix for client access)
 */

import { Logger, parseLogLevel, LogLevel } from './logger';

// Access public env vars (VITE_ prefixed)
const clientLogLevel = parseLogLevel(
	typeof import.meta !== 'undefined' ? import.meta.env?.VITE_LOG_LEVEL : undefined
);

/**
 * Main client logger instance
 */
export const clientLogger = new Logger({
	level: clientLogLevel,
	prefix: 'client',
	includeTimestamp: true
});

/**
 * Create a child logger for a specific module/feature
 */
export function createClientLogger(module: string): Logger {
	return clientLogger.child(module);
}

// Log the current log level on initialization (only in debug mode)
if (clientLogLevel >= LogLevel.DEBUG) {
	clientLogger.debug(`Logger initialized with level: ${clientLogger.getLevelName()}`);
}

// Re-export utilities for convenience
export { LogLevel, parseLogLevel } from './logger';
export type { LogContext, LoggerConfig } from './logger';
