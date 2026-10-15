/**
 * Give every organization without a subscription one, so entitlements can come
 * from the organization's plan instead of the retired `user.entitlements`.
 *
 * Plan: Pro when the organization's owner held the `autogen` entitlement under
 * the old per-user model, Standard otherwise — nobody gains or loses access.
 * Interval: the catalog default (annual).
 *
 * Idempotent — organizations with a live subscription are skipped — so setup
 * runs it on every deploy, after the organization backfill.
 *
 * Imports are relative: this runs from tsx scripts.
 */

import type { Kysely } from 'kysely';
import { DEFAULT_BILLING_INTERVAL, ENTITLEMENT_AUTOGEN } from '../../billing/plans';
import type { DB } from '../../db/types';
import { parseEntitlements } from '../entitlements';
import type { IdentityService } from '../identity/types';
import type { BillingService } from './service';

export async function backfillSubscriptions({
	db,
	identity,
	billing
}: {
	db: Kysely<DB>;
	identity: IdentityService;
	billing: BillingService;
}): Promise<{ created: number }> {
	const users = await db
		.selectFrom('user')
		.select(['id', 'email', 'entitlements'])
		.orderBy('createdAt', 'asc')
		.execute();

	let created = 0;
	for (const user of users) {
		const hadAutogen = parseEntitlements(user.entitlements).includes(ENTITLEMENT_AUTOGEN);
		for (const membership of await identity.listMemberships(user.id)) {
			if (membership.role !== 'owner') continue;
			if (await billing.getSubscription(membership.organizationId)) continue;

			await billing.subscribe({
				organizationId: membership.organizationId,
				organizationName: membership.organizationName,
				billingEmail: user.email,
				planId: hadAutogen ? 'pro' : 'standard',
				interval: DEFAULT_BILLING_INTERVAL
			});
			created++;
		}
	}
	return { created };
}
