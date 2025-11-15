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

	const db = createDB();

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
