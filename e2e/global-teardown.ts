/**
 * Playwright Global Teardown
 *
 * Runs once after all tests to clean up the test database
 */

import { cleanupTestDb } from './test-db';

export default async function globalTeardown() {
	console.log('Cleaning up test database...');

	// Clean up the test database
	await cleanupTestDb();

	console.log('Test database cleaned up');
}
