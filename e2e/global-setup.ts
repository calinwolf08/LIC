/**
 * Playwright Global Setup
 *
 * Runs once before all tests.
 * Note: The test database is now set up by the webServer command
 * (see playwright.config.ts) to avoid race conditions with the
 * preview server's database connection.
 */

import { getTestDb } from './test-db';

export default async function globalSetup() {
	console.log('Verifying test database...');

	// Get connection to existing test database (reinit = false)
	// The database is already set up by the webServer command
	const db = await getTestDb(false);

	console.log('Test database verified');

	// Don't destroy the database - it will be used by tests
	// It will be cleaned up after all tests complete
}
