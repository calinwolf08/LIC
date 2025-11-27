/**
 * Logger Utility
 *
 * A configurable logging system with verbosity levels.
 * Server uses LOG_LEVEL env var, client uses VITE_LOG_LEVEL.
 *
 * Levels (in order of verbosity):
 * - OFF: No logging
 * - ERROR: Only errors
 * - WARN: Errors + warnings
 * - INFO: Errors + warnings + info
 * - DEBUG: All above + debug
 * - TRACE: All above + trace (most verbose)
 */

export enum LogLevel {
	OFF = 0,
	ERROR = 1,
	WARN = 2,
	INFO = 3,
	DEBUG = 4,
	TRACE = 5
}

export type LogLevelName = keyof typeof LogLevel;

export interface LogContext {
	[key: string]: unknown;
}

export interface LoggerConfig {
	level: LogLevel;
	prefix?: string;
	includeTimestamp?: boolean;
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
	[LogLevel.OFF]: 'OFF',
	[LogLevel.ERROR]: 'ERROR',
	[LogLevel.WARN]: 'WARN',
	[LogLevel.INFO]: 'INFO',
	[LogLevel.DEBUG]: 'DEBUG',
	[LogLevel.TRACE]: 'TRACE'
};

export function parseLogLevel(value: string | undefined): LogLevel {
	if (!value) return LogLevel.INFO; // Default to INFO

	const normalized = value.toUpperCase().trim();

	switch (normalized) {
		case 'OFF':
		case '0':
			return LogLevel.OFF;
		case 'ERROR':
		case '1':
			return LogLevel.ERROR;
		case 'WARN':
		case 'WARNING':
		case '2':
			return LogLevel.WARN;
		case 'INFO':
		case '3':
			return LogLevel.INFO;
		case 'DEBUG':
		case '4':
			return LogLevel.DEBUG;
		case 'TRACE':
		case 'VERBOSE':
		case 'ALL':
		case '5':
			return LogLevel.TRACE;
		default:
			console.warn(`Unknown log level "${value}", defaulting to INFO`);
			return LogLevel.INFO;
	}
}

export class Logger {
	private level: LogLevel;
	private prefix: string;
	private includeTimestamp: boolean;

	constructor(config: LoggerConfig) {
		this.level = config.level;
		this.prefix = config.prefix || '';
		this.includeTimestamp = config.includeTimestamp ?? true;
	}

	private formatMessage(levelName: string, message: string, context?: LogContext): string {
		const parts: string[] = [];

		if (this.includeTimestamp) {
			parts.push(`[${new Date().toISOString()}]`);
		}

		parts.push(`[${levelName}]`);

		if (this.prefix) {
			parts.push(`[${this.prefix}]`);
		}

		parts.push(message);

		if (context && Object.keys(context).length > 0) {
			parts.push(JSON.stringify(context, null, 2));
		}

		return parts.join(' ');
	}

	private shouldLog(level: LogLevel): boolean {
		return this.level >= level && this.level !== LogLevel.OFF;
	}

	/**
	 * Create a child logger with a new prefix
	 */
	child(prefix: string): Logger {
		const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
		return new Logger({
			level: this.level,
			prefix: childPrefix,
			includeTimestamp: this.includeTimestamp
		});
	}

	/**
	 * Log an error message
	 */
	error(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			console.error(this.formatMessage('ERROR', message, context));
		}
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(this.formatMessage('WARN', message, context));
		}
	}

	/**
	 * Log an info message
	 */
	info(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.INFO)) {
			console.info(this.formatMessage('INFO', message, context));
		}
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.debug(this.formatMessage('DEBUG', message, context));
		}
	}

	/**
	 * Log a trace message (most verbose)
	 */
	trace(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.TRACE)) {
			console.log(this.formatMessage('TRACE', message, context));
		}
	}

	/**
	 * Get current log level
	 */
	getLevel(): LogLevel {
		return this.level;
	}

	/**
	 * Get current log level name
	 */
	getLevelName(): string {
		return LOG_LEVEL_NAMES[this.level];
	}

	/**
	 * Check if a specific level is enabled
	 */
	isLevelEnabled(level: LogLevel): boolean {
		return this.shouldLog(level);
	}

	/**
	 * Set log level dynamically
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}
}

// Factory function to create a logger
export function createLogger(prefix?: string, level?: LogLevel): Logger {
	return new Logger({
		level: level ?? LogLevel.INFO,
		prefix,
		includeTimestamp: true
	});
}
