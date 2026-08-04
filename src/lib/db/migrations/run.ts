#!/usr/bin/env tsx

/**
 * Migration runner CLI
 *
 * Run with: npm run db:migrate
 */

import { createDB } from '../connection';
import { migrateToLatest } from './index';

async function main() {
	console.log('🚀 Running database migrations...\n');

	// Honour DATABASE_PATH so migrations target the same file the app uses
	// (e.g. a persistent volume in production), not just ./sqlite.db.
	const db = createDB(process.env.DATABASE_PATH || './sqlite.db');

	try {
		await migrateToLatest(db);
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Migration failed:', error);
	process.exit(1);
});
