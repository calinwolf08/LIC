#!/usr/bin/env tsx

/**
 * Migration runner CLI
 *
 * Run with: npm run db:migrate
 */

import { describeDbConfig, resolveDbConfig } from '../config';
import { createDB } from '../connection';
import { migrateToLatest } from './index';

async function main() {
	// Resolve the engine + target from the environment (DATABASE_DIALECT /
	// DATABASE_URL / DATABASE_PATH) so migrations always hit the same database
	// the app uses — a persistent volume or a Postgres server in production.
	const config = resolveDbConfig(process.env);
	console.log(`🚀 Running database migrations — ${describeDbConfig(config)}\n`);

	const db = createDB(config);

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
