import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';

/**
 * Create and configure the database instance
 *
 * Uses better-sqlite3 with Kysely for type-safe SQL queries
 */
export function createDB(): Kysely<DB> {
	const sqlite = new Database('./sqlite.db');

	// Enable WAL mode for better concurrency
	sqlite.pragma('journal_mode = WAL');

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
 */
export const db = createDB();
