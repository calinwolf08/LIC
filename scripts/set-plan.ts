#!/usr/bin/env tsx
/**
 * Put a user's organization on a plan (e.g. Pro to unlock auto-generation).
 *
 * Usage:
 *   npx tsx scripts/set-plan.ts <email> standard|pro [month|year]
 *
 * Example:
 *   npx tsx scripts/set-plan.ts admin@example.com pro
 *
 * Acts on the user's active (oldest) organization, through BillingService, so
 * it works on every engine (reads DATABASE_DIALECT / DATABASE_URL /
 * DATABASE_PATH like the other db scripts). Takes effect on the next request.
 */

import { isBillingInterval, isPlanId } from '../src/lib/billing/plans';
import { db } from '../src/lib/db/connection';
import { billing } from '../src/lib/server/billing';
import { identity, pickActiveMembership } from '../src/lib/server/identity';

async function main() {
	const [, , email, planId, intervalArg] = process.argv;
	if (!email || !isPlanId(planId) || (intervalArg !== undefined && !isBillingInterval(intervalArg))) {
		console.error('Usage: npx tsx scripts/set-plan.ts <email> standard|pro [month|year]');
		process.exit(1);
	}

	const user = await db
		.selectFrom('user')
		.select(['id', 'email'])
		.where('email', '=', email)
		.executeTakeFirst();
	if (!user) throw new Error(`No user found with email "${email}"`);

	const membership = pickActiveMembership(await identity.listMemberships(user.id), null);
	if (!membership) throw new Error(`${email} belongs to no organization (run npm run db:migrate)`);

	const current = await billing.getSubscription(membership.organizationId);
	const interval = isBillingInterval(intervalArg) ? intervalArg : (current?.interval ?? 'year');

	if (!current) {
		await billing.subscribe({
			organizationId: membership.organizationId,
			organizationName: membership.organizationName,
			billingEmail: user.email,
			planId,
			interval
		});
	} else if (current.planId !== planId || current.interval !== interval) {
		await billing.changePlan({ organizationId: membership.organizationId, planId, interval });
	}

	console.log(`"${membership.organizationName}" (${email}) is on ${planId}/${interval}`);
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => db.destroy());
