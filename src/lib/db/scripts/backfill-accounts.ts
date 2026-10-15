/**
 * Bring every account up to the current model, idempotently. Run by `db:setup`
 * and `db:migrate` after migrations:
 *
 *   1. every user belongs to an organization (organization backfill), then
 *   2. every organization has a subscription (subscription backfill).
 */

import type { Kysely } from 'kysely';
import { createBilling } from '../../server/billing';
import { backfillSubscriptions } from '../../server/billing/backfill';
import { createIdentity } from '../../server/identity';
import { backfillOrganizations } from '../../server/organizations/backfill';
import type { DbDialectName } from '../dialects/types';
import type { DB } from '../types';

export async function backfillAccounts(
	db: Kysely<DB>,
	dialect: DbDialectName
): Promise<{ organizations: number; subscriptions: number }> {
	const identity = createIdentity({ db, dialect });
	const { created: organizations } = await backfillOrganizations({ db, identity });
	const { created: subscriptions } = await backfillSubscriptions({
		db,
		identity,
		billing: createBilling({ db })
	});
	return { organizations, subscriptions };
}
