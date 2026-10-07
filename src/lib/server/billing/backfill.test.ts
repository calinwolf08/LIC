/**
 * The subscription backfill, on every supported engine: each organization gets
 * a manual subscription whose plan carries over its owner's old per-user
 * `autogen` grant, organizations already subscribed are left alone, and a
 * second run changes nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createAuth } from '../../auth';
import type { DB } from '../../db/types';
import { createBetterAuthIdentity } from '../identity/better-auth/identity';
import type { IdentityService } from '../identity/types';
import { createIdentityBillingDb, ENGINES, insertUser } from '../testing/engines';
import { backfillSubscriptions } from './backfill';
import { createManualProvider } from './providers/manual';
import { createBillingService, type BillingService } from './service';

describe.each(ENGINES)('backfillSubscriptions on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;
	let identity: IdentityService;
	let billing: BillingService;

	beforeAll(async () => {
		db = await createIdentityBillingDb(dialect, connect);
		identity = createBetterAuthIdentity({ auth: createAuth({ db, dialect }), db });
		billing = createBillingService({ db, provider: createManualProvider() });
	}, 60_000);

	afterAll(async () => {
		await db?.destroy();
	});

	async function orgOf(userId: string): Promise<string> {
		const [membership] = await identity.listMemberships(userId);
		return membership.organizationId;
	}

	it('carries each owner’s old autogen grant over to their organization’s plan', async () => {
		await insertUser(db, { id: 'entitled', name: 'Ann', entitlements: '["autogen"]' });
		await insertUser(db, { id: 'plain', name: 'Ben' });
		await insertUser(db, { id: 'subscribed', name: 'Cy', entitlements: '["autogen"]' });
		await insertUser(db, { id: 'broken-json', name: 'Di', entitlements: '{not json' });
		for (const id of ['entitled', 'plain', 'subscribed', 'broken-json']) {
			await identity.createOrganization({ name: `${id} org`, ownerUserId: id });
		}
		// Already on a plan (chosen explicitly): must not be touched.
		await billing.subscribe({
			organizationId: await orgOf('subscribed'),
			organizationName: 'subscribed org',
			billingEmail: 'subscribed@example.com',
			planId: 'standard',
			interval: 'month'
		});

		expect(await backfillSubscriptions({ db, identity, billing })).toEqual({ created: 3 });

		expect(await billing.getSubscription(await orgOf('entitled'))).toMatchObject({
			planId: 'pro',
			interval: 'year',
			status: 'active',
			provider: 'manual'
		});
		expect(await billing.entitlementsFor(await orgOf('entitled'))).toEqual(['autogen']);
		expect((await billing.getSubscription(await orgOf('plain')))?.planId).toBe('standard');
		expect((await billing.getSubscription(await orgOf('broken-json')))?.planId).toBe('standard');
		expect(await billing.getSubscription(await orgOf('subscribed'))).toMatchObject({
			planId: 'standard',
			interval: 'month'
		});

		expect(await backfillSubscriptions({ db, identity, billing })).toEqual({ created: 0 });
	});

	it('changes plans on this engine too', async () => {
		const org = await orgOf('plain');
		await billing.changePlan({ organizationId: org, planId: 'pro', interval: 'year' });
		expect(await billing.entitlementsFor(org)).toEqual(['autogen']);
	});
});
