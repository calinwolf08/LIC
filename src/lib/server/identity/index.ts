/**
 * The application's identity service — the single entry point for
 * authentication on the server. See `types.ts` for why app code must not reach
 * for better-auth directly.
 */

import type { Kysely } from 'kysely';
import { auth, createAuth } from '../../auth';
import { db } from '../../db/connection';
import type { DbDialectName } from '../../db/dialects/types';
import type { DB } from '../../db/types';
import { createBetterAuthIdentity } from './better-auth/identity';
import type { IdentityService } from './types';

export * from './types';
export { pickActiveMembership } from './memberships';

/** The identity service bound to the application's database. */
export const identity: IdentityService = createBetterAuthIdentity({ auth, db });

/**
 * An identity service over another database — for scripts (setup, backfill)
 * and tests that run against a connection other than the app singleton.
 */
export function createIdentity(database: {
	db: Kysely<DB>;
	dialect: DbDialectName;
}): IdentityService {
	return createBetterAuthIdentity({ auth: createAuth(database), db: database.db });
}
