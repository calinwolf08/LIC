#!/usr/bin/env tsx

/**
 * Migration runner CLI
 *
 * Run with: npm run db:migrate
 */

import { describeDbConfig, resolveDbConfig } from '../config';
import { createDB } from '../connection';
import { migrateToLatest } from './index';
import { ensureAuthTables } from '../scripts/ensure-auth-tables';
import { createIdentity } from '../../server/identity';
import { backfillOrganizations } from '../../server/organizations/backfill';

async function main() {
	// Resolve the engine + target from the environment (DATABASE_DIALECT /
	// DATABASE_URL / DATABASE_PATH) so migrations always hit the same database
	// the app uses — a persistent volume or a Postgres server in production.
	const config = resolveDbConfig(process.env);
	console.log(`🚀 Running database migrations — ${describeDbConfig(config)}\n`);

	const db = createDB(config);

	try {
		// Auth tables first (core + organization plugin): idempotent, and the
		// migrations and the backfill below both rely on them.
		await ensureAuthTables(db, config.dialect);
		await migrateToLatest(db);

		const { created } = await backfillOrganizations({
			db,
			identity: createIdentity({ db, dialect: config.dialect })
		});
		if (created > 0) console.log(`🏢 Created ${created} organization(s) for existing users`);
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Migration failed:', error);
	process.exit(1);
});
