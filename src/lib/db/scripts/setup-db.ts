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
 * It NEVER seeds — production must come up empty.
 *
 * The engine and target come from the environment (DATABASE_DIALECT /
 * DATABASE_URL / DATABASE_PATH — see src/lib/db/config.ts), so this is the same
 * command whether the deploy is on SQLite or PostgreSQL. Point DATABASE_PATH at
 * a persistent volume when running on SQLite.
 */

import { describeDbConfig, resolveDbConfig } from '../config';
import { createDB } from '../connection';
import { migrateToLatest } from '../migrations';
import { ensureAuthTables } from './ensure-auth-tables';

async function main() {
	const config = resolveDbConfig(process.env);
	console.log(`🔧 Setting up database — ${describeDbConfig(config)}`);

	const db = createDB(config);
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
