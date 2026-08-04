/**
 * Database Test Utilities
 *
 * Utilities for creating and managing test databases in unit tests.
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';
import { getMigrationProvider } from './migrations';

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
 * Creates auth tables (user, session, account, verification)
 * These are normally created by better-auth but we need them for tests
 */
async function createAuthTables(db: Kysely<DB>): Promise<void> {
	await db.schema
		.createTable('user')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('emailVerified', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('image', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull())
		.addColumn('updatedAt', 'text', (col) => col.notNull())
		.addColumn('active_schedule_id', 'text')
		.execute();

	await db.schema
		.createTable('session')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('userId', 'text', (col) => col.notNull())
		.addColumn('token', 'text', (col) => col.notNull())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('ipAddress', 'text')
		.addColumn('userAgent', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull())
		.addColumn('updatedAt', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('account')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('userId', 'text', (col) => col.notNull())
		.addColumn('accountId', 'text', (col) => col.notNull())
		.addColumn('providerId', 'text', (col) => col.notNull())
		.addColumn('accessToken', 'text')
		.addColumn('accessTokenExpiresAt', 'text')
		.addColumn('refreshToken', 'text')
		.addColumn('refreshTokenExpiresAt', 'text')
		.addColumn('idToken', 'text')
		.addColumn('scope', 'text')
		.addColumn('password', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull())
		.addColumn('updatedAt', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('verification')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('identifier', 'text', (col) => col.notNull())
		.addColumn('value', 'text', (col) => col.notNull())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('createdAt', 'text', (col) => col.notNull())
		.addColumn('updatedAt', 'text', (col) => col.notNull())
		.execute();
}

/**
 * Runs all migrations on a test database
 */
export async function runTestMigrations(db: Kysely<DB>): Promise<void> {
	// Create auth tables first (normally created by better-auth)
	await createAuthTables(db);

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
