#!/usr/bin/env tsx

/**
 * Production database bootstrap — run once per deploy, before the server starts.
 *
 *   npm run db:setup
 *
 * Idempotent and safe to re-run on every deploy:
 *   1. creates the better-auth tables if missing (they are NOT created at
 *      runtime, which is why a fresh database 500s on the first sign-up), then
 *   2. applies all pending Kysely migrations (guarded/idempotent).
 *
 * Targets DATABASE_PATH (falling back to ./sqlite.db) so it operates on the same
 * file the app uses — point DATABASE_PATH at a persistent volume in production.
 */

import { createDB } from '../connection';
import { migrateToLatest } from '../migrations';
import { ensureAuthTables } from './ensure-auth-tables';

async function main() {
	const dbPath = process.env.DATABASE_PATH || './sqlite.db';
	console.log(`🔧 Setting up database at ${dbPath}`);

	const db = createDB(dbPath);
	try {
		console.log('  • Ensuring better-auth tables exist…');
		await ensureAuthTables(db);

		console.log('  • Applying migrations…');
		await migrateToLatest(db);

		console.log('✅ Database setup complete');
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Database setup failed:', error);
	process.exit(1);
});
