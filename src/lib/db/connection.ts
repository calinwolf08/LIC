import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';

/**
 * Create and configure the database instance
 *
 * Uses better-sqlite3 with Kysely for type-safe SQL queries
 * @param dbPath - Optional path to the database file (defaults to './sqlite.db')
 */
export function createDB(dbPath = './sqlite.db'): Kysely<DB> {
	const sqlite = new Database(dbPath);

	// Enable WAL mode for better concurrency
	sqlite.pragma('journal_mode = WAL');

	// Set busy timeout to 10 seconds to wait for locks instead of failing immediately
	sqlite.pragma('busy_timeout = 10000');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	return db;
}

/**
 * Singleton database instance
 * Import this throughout the app for database operations
 * Uses DATABASE_PATH environment variable if set (for testing)
 */
export const db = createDB(process.env.DATABASE_PATH || './sqlite.db');
