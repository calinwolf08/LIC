#!/usr/bin/env tsx

/**
 * E2E Test Database Setup Script
 *
 * Creates the test database with auth tables and runs migrations.
 * Run with: DATABASE_PATH=./test-sqlite.db npx tsx e2e/setup-test-db.ts
 */

import { createDB } from '../src/lib/db/connection';
import { migrateToLatest } from '../src/lib/db/migrations';
import { ensureAuthTables } from '../src/lib/db/scripts/ensure-auth-tables';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB_PATH = process.env.DATABASE_PATH || './test-sqlite.db';

async function main() {
	console.log('Setting up test database...');

	// Delete existing test database if it exists
	if (existsSync(TEST_DB_PATH)) {
		unlinkSync(TEST_DB_PATH);
		console.log('Deleted existing test database');
	}

	// Create new database connection
	const db = createDB(TEST_DB_PATH);

	try {
		// Create auth tables first (they're required for migration 023)
		await ensureAuthTables(db);
		console.log('Created auth tables');

		// Run migrations
		await migrateToLatest(db);
		console.log('Test database setup complete');
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Test database setup failed:', error);
	process.exit(1);
});
