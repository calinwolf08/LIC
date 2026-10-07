/**
 * ensureAuthTables upgrades a database created before organizations existed,
 * on every engine, and is safe to re-run (deploys run it every release).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createDB, createDBFromDialect } from '../connection';
import type { DbDialectName } from '../dialects/types';
import type { DB } from '../types';
import { ensureAuthTables, getAuthDialectProfile } from './ensure-auth-tables';

const engines: Array<{ dialect: DbDialectName; connect: () => Promise<Kysely<DB>> }> = [
	{ dialect: 'sqlite', connect: async () => createDB(':memory:') },
	{
		dialect: 'postgres',
		connect: async () => {
			const { KyselyPGlite } = await import('kysely-pglite');
			const { dialect } = await KyselyPGlite.create();
			return createDBFromDialect(dialect);
		}
	}
];

async function columnsOf(db: Kysely<DB>, table: string): Promise<string[]> {
	const tables = await db.introspection.getTables();
	return (tables.find((t) => t.name === table)?.columns ?? []).map((c) => c.name).sort();
}

describe.each(engines)('ensureAuthTables on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;

	afterEach(async () => {
		await db?.destroy();
	});

	it(
		'adds the organization tables and session column to a pre-organization database',
		{ timeout: 60000 },
		async () => {
			db = await connect();
			// The pre-organization `session` table, as older deploys created it.
			const t = getAuthDialectProfile(dialect);
			await db.schema
				.createTable('user')
				.addColumn('id', sql.raw(t.text), (col) => col.primaryKey())
				.addColumn('name', sql.raw(t.text), (col) => col.notNull())
				.addColumn('email', sql.raw(t.text), (col) => col.notNull())
				.execute();
			await db.schema
				.createTable('session')
				.addColumn('id', sql.raw(t.text), (col) => col.primaryKey())
				.addColumn('expiresAt', sql.raw(t.timestamp), (col) => col.notNull())
				.addColumn('token', sql.raw(t.text), (col) => col.notNull())
				.addColumn('userId', sql.raw(t.text), (col) => col.notNull())
				.execute();

			await ensureAuthTables(db, dialect);
			// Re-running is a no-op, not an error.
			await ensureAuthTables(db, dialect);

			expect(await columnsOf(db, 'session')).toContain('activeOrganizationId');
			expect(await columnsOf(db, 'organization')).toEqual(
				['createdAt', 'id', 'logo', 'metadata', 'name', 'slug'].sort()
			);
			expect(await columnsOf(db, 'member')).toEqual(
				['createdAt', 'id', 'organizationId', 'role', 'userId'].sort()
			);
			expect(await columnsOf(db, 'invitation')).toEqual(
				['email', 'expiresAt', 'id', 'inviterId', 'organizationId', 'role', 'status'].sort()
			);
		}
	);
});
