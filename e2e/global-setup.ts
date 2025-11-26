/**
 * Playwright Global Setup
 *
 * Runs once before all tests to initialize the test database
 */

import { getTestDb } from './test-db';

export default async function globalSetup() {
	console.log('Setting up test database...');

	// Initialize and migrate the test database (reinit = true)
	const db = await getTestDb(true);

	console.log('Test database ready');

	// Don't destroy the database - it will be used by tests
	// It will be cleaned up after all tests complete
}
