/**
 * The organization backfill, on every supported engine (SQLite and PGlite):
 * existing users each get one organization they own, users who already belong
 * to one are left alone, and a second run changes nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createAuth } from '../../auth';
import type { DB } from '../../db/types';
import { createBetterAuthIdentity } from '../identity/better-auth/identity';
import type { IdentityService } from '../identity/types';
import { createIdentityBillingDb, ENGINES, insertUser } from '../testing/engines';
import { backfillOrganizations, defaultOrganizationName } from './backfill';

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

describe.each(ENGINES)('backfillOrganizations on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;
	let identity: IdentityService;

	beforeAll(async () => {
		db = await createIdentityBillingDb(dialect, connect);
		identity = createBetterAuthIdentity({ auth: createAuth({ db, dialect }), db });
	}, 60_000);

	afterAll(async () => {
		await db?.destroy();
	});

	it('gives each organization-less user one they own, once', async () => {
		await insertUser(db, { id: 'legacy-a', name: 'Alice' });
		await insertUser(db, { id: 'legacy-b', name: 'Bob' });
		await insertUser(db, { id: 'has-org', name: 'Carol' });
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
