/**
 * Test support: a database on each supported engine (SQLite in memory, and
 * PGlite — real PostgreSQL in-process) with the auth tables (core +
 * organization plugin), the app-owned `user` columns better-auth reads, and
 * the billing tables. Enough to drive IdentityService and BillingService.
 */

import { sql, type Kysely } from 'kysely';
import { createDB, createDBFromDialect } from '../../db/connection';
import { getDialectAdapter } from '../../db/dialects/index';
import type { DbDialectName } from '../../db/dialects/types';
import { up as createBillingTables } from '../../db/migrations/shared/112_billing';
import { ensureAuthTables } from '../../db/scripts/ensure-auth-tables';
import type { DB } from '../../db/types';

export const ENGINES: Array<{ dialect: DbDialectName; connect: () => Promise<Kysely<DB>> }> = [
	{ dialect: 'sqlite', connect: async () => createDB(':memory:') },
	{
		dialect: 'postgres',
		connect: async () => {
			// Imported lazily so the SQLite lane never boots the WASM Postgres build.
			const { KyselyPGlite } = await import('kysely-pglite');
			const { dialect } = await KyselyPGlite.create();
			return createDBFromDialect(dialect);
		}
	}
];

export async function createIdentityBillingDb(
	dialect: DbDialectName,
	connect: () => Promise<Kysely<DB>>
): Promise<Kysely<DB>> {
	process.env.BETTER_AUTH_SECRET ||= 'engines-test-secret-engines-test-secret';
	const db = await connect();
	await ensureAuthTables(db, dialect);
	const t = getDialectAdapter(dialect).columnTypes;
	await db.schema.alterTable('user').addColumn('active_schedule_id', sql.raw(t.text)).execute();
	await db.schema
		.alterTable('user')
		.addColumn('entitlements', sql.raw(t.text), (col) => col.defaultTo('[]'))
		.execute();
	await createBillingTables(db as Kysely<unknown> as never);
	return db;
}

/** Insert a bare user row (no password), as a pre-existing account would be. */
export async function insertUser(
	db: Kysely<DB>,
	user: { id: string; name: string; entitlements?: string }
): Promise<void> {
	await db
		.insertInto('user')
		.values({
			id: user.id,
			name: user.name,
			email: `${user.id}@example.com`,
			...(user.entitlements ? { entitlements: user.entitlements } : {})
		} as never)
		.execute();
}
