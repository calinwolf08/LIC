/**
 * Test Database Helper
 *
 * Creates and manages a separate database for E2E tests
 */

import { createDB } from '../src/lib/db/connection';
import { migrateToLatest } from '../src/lib/db/migrations';
import { unlinkSync, existsSync } from 'fs';
import type { Kysely } from 'kysely';
import type { DB } from '../src/lib/db/types';

const TEST_DB_PATH = './test-sqlite.db';

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
	maxRetries = 5,
	initialDelay = 100
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
	await retryWithBackoff(() => db.deleteFrom('preceptor_site_clerkships').execute());
	await retryWithBackoff(() => db.deleteFrom('site_electives').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkship_sites').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkship_electives').execute());
	await retryWithBackoff(() => db.deleteFrom('clerkship_requirements').execute());
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
