/**
 * The organization backfill, on every supported engine (SQLite and PGlite):
 * existing users each get one organization they own, users who already belong
 * to one are left alone, and a second run changes nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { createAuth } from '../../auth';
import { createDB, createDBFromDialect } from '../../db/connection';
import { getDialectAdapter } from '../../db/dialects/index';
import type { DbDialectName } from '../../db/dialects/types';
import { ensureAuthTables } from '../../db/scripts/ensure-auth-tables';
import type { DB } from '../../db/types';
import { createBetterAuthIdentity } from '../identity/better-auth/identity';
import type { IdentityService } from '../identity/types';
import { backfillOrganizations, defaultOrganizationName } from './backfill';

process.env.BETTER_AUTH_SECRET ||= 'backfill-test-secret-backfill-test-secret';

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

describe('defaultOrganizationName', () => {
	it('names the program after the user', () => {
		expect(defaultOrganizationName({ name: 'Dr. Jane Doe', email: 'jane@x.edu' })).toBe(
			"Dr. Jane Doe's Program"
		);
	});

	it('falls back to the e-mail local part when the name is blank', () => {
		expect(defaultOrganizationName({ name: '  ', email: 'jdoe@x.edu' })).toBe("jdoe's Program");
	});
});

describe.each(engines)('backfillOrganizations on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;
	let identity: IdentityService;

	async function insertUser(id: string, name: string): Promise<void> {
		await db
			.insertInto('user')
			.values({ id, name, email: `${id}@example.com` } as never)
			.execute();
	}

	beforeAll(async () => {
		db = await connect();
		await ensureAuthTables(db, dialect);
		// The app-owned `user` columns better-auth reads as additional fields.
		const t = getDialectAdapter(dialect).columnTypes;
		await db.schema.alterTable('user').addColumn('active_schedule_id', sql.raw(t.text)).execute();
		await db.schema
			.alterTable('user')
			.addColumn('entitlements', sql.raw(t.text), (col) => col.defaultTo('[]'))
			.execute();
		identity = createBetterAuthIdentity({ auth: createAuth({ db, dialect }), db });
	}, 60_000);

	afterAll(async () => {
		await db?.destroy();
	});

	it('gives each organization-less user one they own, once', async () => {
		await insertUser('legacy-a', 'Alice');
		await insertUser('legacy-b', 'Bob');
		await insertUser('has-org', 'Carol');
		const existing = await identity.createOrganization({
			name: 'Carol Existing',
			ownerUserId: 'has-org'
		});

		expect(await backfillOrganizations({ db, identity })).toEqual({ created: 2 });

		expect(await identity.listMemberships('legacy-a')).toEqual([
			{ organizationId: expect.any(String), organizationName: "Alice's Program", role: 'owner' }
		]);
		expect(await identity.listMemberships('legacy-b')).toEqual([
			{ organizationId: expect.any(String), organizationName: "Bob's Program", role: 'owner' }
		]);
		expect(await identity.listMemberships('has-org')).toEqual([
			{ organizationId: existing.id, organizationName: 'Carol Existing', role: 'owner' }
		]);

		// Idempotent: nothing left to do.
		expect(await backfillOrganizations({ db, identity })).toEqual({ created: 0 });
		expect(await identity.listMemberships('legacy-a')).toHaveLength(1);
	});
});
