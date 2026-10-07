/**
 * Give every user who belongs to no organization one of their own.
 *
 * Accounts created before organizations existed have none. Each gets a
 * single-member organization with them as `owner`, which preserves today's
 * behaviour exactly: one user, one program, data still scoped by `user_id`.
 *
 * Idempotent — users who already belong to an organization are skipped — so
 * `db:setup` and `db:migrate` run it on every deploy. Anyone it misses (or who
 * signs up later without naming one) is caught by the app layout, which sends
 * them to /onboarding/organization.
 *
 * Imports are relative: this runs from tsx scripts.
 */

import type { Kysely } from 'kysely';
import type { DB } from '../../db/types';
import type { IdentityService } from '../identity/types';

/** The name a backfilled organization gets: "<user name>'s Program". */
export function defaultOrganizationName(user: { name: string | null; email: string }): string {
	const name = user.name?.trim() || user.email.split('@')[0] || 'My';
	return `${name}'s Program`;
}

export async function backfillOrganizations({
	db,
	identity
}: {
	db: Kysely<DB>;
	identity: IdentityService;
}): Promise<{ created: number }> {
	const users = await db
		.selectFrom('user')
		.select(['id', 'name', 'email'])
		.orderBy('createdAt', 'asc')
		.execute();

	let created = 0;
	for (const user of users) {
		const memberships = await identity.listMemberships(user.id);
		if (memberships.length > 0) continue;

		await identity.createOrganization({
			name: defaultOrganizationName(user),
			ownerUserId: user.id
		});
		created++;
	}
	return { created };
}
