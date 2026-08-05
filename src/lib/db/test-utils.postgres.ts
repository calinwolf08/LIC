/**
 * Postgres test database helper (opt-in).
 *
 * Kept OUT of test-utils.ts so the default SQLite suite never loads PGlite (the
 * WASM Postgres is comparatively heavy to boot). Import this only from tests
 * that specifically target the Postgres path.
 *
 * Uses PGlite — a real, in-process PostgreSQL — so the Postgres query layer can
 * be exercised in CI with no server and no Docker, the same engine the
 * migration-equivalence and auth sign-up tests use.
 */

import { Kysely } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
import type { DB } from './types';
import { migrateToLatest } from './migrations';
import { ensureAuthTables } from './scripts/ensure-auth-tables';

export interface PostgresTestDb {
	db: Kysely<DB>;
	destroy: () => Promise<void>;
}

/**
 * A fresh in-memory Postgres with the auth tables + full migration history
 * applied — the same shape `db:setup` builds in production, so integration
 * tests run against the real Postgres schema.
 */
export async function createPostgresTestDatabaseWithMigrations(): Promise<PostgresTestDb> {
	const { dialect } = await KyselyPGlite.create();
	const db = new Kysely<DB>({ dialect });

	await ensureAuthTables(db, 'postgres');
	await migrateToLatest(db, { dialect: 'postgres' });

	return {
		db,
		destroy: () => db.destroy(),
	};
}
