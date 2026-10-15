/**
 * Database Test Utilities
 *
 * Utilities for creating and managing test databases in unit tests.
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';
import { getMigrationProvider } from './migrations';
import { ensureAuthTables } from './scripts/ensure-auth-tables';

/**
 * Creates an in-memory SQLite database for testing
 */
export function createTestDatabase(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite
		})
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
	// Auth tables first, from the same DDL production uses (core + organization
	// plugin), so the harness never drifts from the real auth schema.
	await ensureAuthTables(db, 'sqlite');

	// Source the SQLite history (+ any shared migrations) from the composite
	// provider so this harness never drifts from the real migration set — new
	// migrations are picked up automatically. Run each `up` directly, in name
	// order, rather than through the Migrator, so in-memory test setup stays fast
	// and silent (no tracking table, no per-migration logging).
	const migrations = await getMigrationProvider('sqlite').getMigrations();
	for (const name of Object.keys(migrations).sort()) {
		await migrations[name].up(db as unknown as Kysely<unknown>);
	}
}

/**
 * Creates a test database with all migrations applied
 */
export async function createTestDatabaseWithMigrations(): Promise<Kysely<DB>> {
	const db = createTestDatabase();
	await runTestMigrations(db);
	return db;
}
