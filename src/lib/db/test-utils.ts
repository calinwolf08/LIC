/**
 * Database Test Utilities
 *
 * Utilities for creating and managing test databases in unit tests.
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';

/**
 * Creates an in-memory SQLite database for testing
 */
export function createTestDatabase(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	return db;
}

/**
 * Cleans up and destroys a test database
 */
export async function cleanupTestDatabase(db: Kysely<DB>): Promise<void> {
	await db.destroy();
}

/**
 * Runs all migrations on a test database
 */
export async function runTestMigrations(db: Kysely<DB>): Promise<void> {
	// Import and run migrations
	const { up: migration001 } = await import('./migrations/001_initial_schema');
	const { up: migration002 } = await import('./migrations/002_scheduling_configuration_schema');

	await migration001(db);
	await migration002(db);
}

/**
 * Creates a test database with all migrations applied
 */
export async function createTestDatabaseWithMigrations(): Promise<Kysely<DB>> {
	const db = createTestDatabase();
	await runTestMigrations(db);
	return db;
}
