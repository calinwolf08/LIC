/**
 * Test Database Helper
 *
 * Creates and manages a separate database for E2E tests
 */

import { createDB } from '../src/lib/db/connection';
import { migrateToLatest } from '../src/lib/db/migrations';
import { unlinkSync, existsSync } from 'fs';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '../src/lib/db/types';

const TEST_DB_PATH = './test-sqlite.db';

/**
 * Create better-auth tables if they don't exist
 * This is required because better-auth tables are normally created lazily
 * but our migrations (023) reference the user table
 */
async function createAuthTables(db: Kysely<any>): Promise<void> {
	// Create user table
	await db.schema
		.createTable('user')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('emailVerified', 'integer', (col) => col.defaultTo(0))
		.addColumn('image', 'text')
		.addColumn('active_schedule_id', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create session table
	await db.schema
		.createTable('session')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('token', 'text', (col) => col.notNull().unique())
		.addColumn('ipAddress', 'text')
		.addColumn('userAgent', 'text')
		.addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create account table
	await db.schema
		.createTable('account')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('accountId', 'text', (col) => col.notNull())
		.addColumn('providerId', 'text', (col) => col.notNull())
		.addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
		.addColumn('accessToken', 'text')
		.addColumn('refreshToken', 'text')
		.addColumn('idToken', 'text')
		.addColumn('accessTokenExpiresAt', 'text')
		.addColumn('refreshTokenExpiresAt', 'text')
		.addColumn('scope', 'text')
		.addColumn('password', 'text')
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create verification table
	await db.schema
		.createTable('verification')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('identifier', 'text', (col) => col.notNull())
		.addColumn('value', 'text', (col) => col.notNull())
		.addColumn('expiresAt', 'text', (col) => col.notNull())
		.addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updatedAt', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
}

let testDb: Kysely<DB> | null = null;

/**
 * Get or create the test database instance
 *
 * If reinit is true, deletes and recreates the database (for global setup)
 * Otherwise, just creates a connection to the existing database (for tests)
 */
export async function getTestDb(reinit = false): Promise<Kysely<DB>> {
	if (testDb && !reinit) {
		return testDb;
	}

	if (reinit) {
		// Delete existing test database if it exists
		if (existsSync(TEST_DB_PATH)) {
			unlinkSync(TEST_DB_PATH);
		}
	}

	// Create new database connection
	testDb = createDB(TEST_DB_PATH);

	// Run migrations only if reinitializing
	if (reinit) {
		// Create auth tables first (they're required for migration 023)
		await createAuthTables(testDb);
		await migrateToLatest(testDb);
	}

	return testDb;
}

/**
 * Clean up the test database
 */
export async function cleanupTestDb(): Promise<void> {
	if (testDb) {
		await testDb.destroy();
		testDb = null;
	}

	// Delete the test database file
	if (existsSync(TEST_DB_PATH)) {
		unlinkSync(TEST_DB_PATH);
	}
}

/**
 * Retry a database operation with exponential backoff
 */
async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	maxRetries = 10,
	initialDelay = 200
): Promise<T> {
	let lastError: Error | null = null;

	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error: any) {
			lastError = error;

			// Only retry on database locked errors
			if (error.code !== 'SQLITE_BUSY' && error.code !== 'SQLITE_LOCKED') {
				throw error;
			}

			// Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
			const delay = initialDelay * Math.pow(2, i);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	throw lastError || new Error('Operation failed after retries');
}

/**
 * Clear all data from tables (for test isolation)
 */
export async function clearTestData(db: Kysely<DB>): Promise<void> {
	// Delete in order to respect foreign key constraints, with retry logic
	await retryWithBackoff(() => db.deleteFrom('preceptor_team_members').execute());
	await retryWithBackoff(() => db.deleteFrom('preceptor_teams').execute());
	await retryWithBackoff(() => db.deleteFrom('student_health_system_onboarding').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkship_sites').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkship_electives').execute());
	// clerkship_requirements table removed in migration 025
	await retryWithBackoff(() => db.deleteFrom('preceptors').execute());
	await retryWithBackoff(() => db.deleteFrom('students').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkships').execute());
	await retryWithBackoff(() => db.deleteFrom('sites').execute());
	await retryWithBackoff(() => db.deleteFrom('health_systems').execute());
}

/**
 * Execute a database operation with retry logic
 */
export async function executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
	return retryWithBackoff(operation);
}
