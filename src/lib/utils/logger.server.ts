/**
 * Server-side Logger
 *
 * Initializes the logger with LOG_LEVEL from environment.
 * This file should only be imported in server-side code.
 *
 * Usage:
 *   import { serverLogger } from '$lib/utils/logger.server';
 *   serverLogger.info('Server started');
 *
 * Environment:
 *   LOG_LEVEL=DEBUG  # Set in .env
 */

import { env } from '$env/dynamic/private';
import { Logger, parseLogLevel, LogLevel } from './logger';

const serverLogLevel = parseLogLevel(env.LOG_LEVEL);

/**
 * Main server logger instance
 */
export const serverLogger = new Logger({
	level: serverLogLevel,
	prefix: 'server',
	includeTimestamp: true
});

/**
 * Create a child logger for a specific module/feature
 */
export function createServerLogger(module: string): Logger {
	return serverLogger.child(module);
}

// Log the current log level on initialization (only in debug mode)
if (serverLogLevel >= LogLevel.DEBUG) {
	serverLogger.debug(`Logger initialized with level: ${serverLogger.getLevelName()}`);
}

// Re-export utilities for convenience
export { LogLevel, parseLogLevel } from './logger';
export type { LogContext, LoggerConfig } from './logger';
