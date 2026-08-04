import { betterAuth } from 'better-auth';
import type { Kysely } from 'kysely';
import { activeDbConfig, db } from './db/connection';
import type { DbDialectName } from './db/dialects/types';
import { getAuthDialectProfile } from './db/scripts/ensure-auth-tables';
import type { DB } from './db/types';

// Read from process.env (available in the SvelteKit server runtime and in
// standalone scripts run via tsx) rather than the compile-time `$env` module,
// so tooling like the seed script can import this file outside the SvelteKit
// build. For the same reason every import above is RELATIVE: `$lib/...` is a
// SvelteKit alias and does not resolve under plain `tsx`.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';

/** What an auth instance needs to talk to a database. */
export interface AuthDatabase {
	readonly db: Kysely<DB>;
	readonly dialect: DbDialectName;
}

/**
 * Create a default schedule for a newly registered user.
 *
 * Called after successful signup to implement the schedule-first architecture.
 * Written as async Kysely queries rather than better-sqlite3's synchronous
 * `prepare().run()`, because that API exists only for SQLite — Postgres drivers
 * are asynchronous, so the old hook could never have run in production.
 *
 * Never throws: a rejected `after` hook would surface as a failed sign-up, and a
 * missing default schedule is recoverable (the user can create one) while a
 * failed registration is not.
 */
async function createDefaultScheduleForUser(db: Kysely<DB>, userId: string): Promise<string | null> {
	try {
		const now = new Date();
		const currentYear = now.getFullYear();

		// Default to academic year (July - June) or calendar year
		const startDate = now.getMonth() >= 6 ? `${currentYear}-07-01` : `${currentYear}-01-01`;
		const endDate = now.getMonth() >= 6 ? `${currentYear + 1}-06-30` : `${currentYear}-12-31`;

		const scheduleId = crypto.randomUUID();
		const timestamp = now.toISOString();

		// Insert the schedule
		await db
			.insertInto('scheduling_periods')
			.values({
				id: scheduleId,
				name: 'My Schedule',
				start_date: startDate,
				end_date: endDate,
				user_id: userId,
				// 0/1 integer on every engine — see DdlTypeMap in db/dialects/types.ts.
				is_active: 0,
				created_at: timestamp,
				updated_at: timestamp,
			})
			.execute();

		// Set as user's active schedule
		await db
			.updateTable('user')
			.set({ active_schedule_id: scheduleId })
			.where('id', '=', userId)
			.execute();

		console.log(`[auth] Created default schedule ${scheduleId} for user ${userId}`);
		return scheduleId;
	} catch (error) {
		// Log error but don't fail signup - user can create schedule manually
		console.error('[auth] Failed to create default schedule for user:', error);
		return null;
	}
}

/**
 * Build an auth instance over any supported engine.
 *
 * One code path for every engine: better-auth 1.3.34 accepts
 * `database: { db: Kysely, type }`, so the driver handle never leaks in here —
 * the dialect registry already produced the Kysely instance, and the profile
 * supplies the name better-auth knows the engine by.
 *
 * Exported (rather than only the singleton below) so tests can build an
 * equivalent instance against an injected dialect — e.g. in-process PostgreSQL
 * via PGlite — without touching process-wide environment variables.
 */
export function createAuth({ db, dialect }: AuthDatabase) {
	const profile = getAuthDialectProfile(dialect);

	return betterAuth({
		emailAndPassword: {
			enabled: true
		},
		database: {
			// better-auth's own queries are schema-agnostic; `DB` does not describe
			// the columns it manages internally.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			db: db as Kysely<any>,
			type: profile.kyselyType
		},
		trustedOrigins: [PUBLIC_BASE_URL, 'http://localhost:4173', 'http://localhost:5173'],
		user: {
			additionalFields: {
				active_schedule_id: {
					type: 'string',
					required: false
				},
				// Stage 2 gating: JSON array of entitlement strings (e.g. ["autogen"]).
				entitlements: {
					type: 'string',
					required: false,
					defaultValue: '[]'
				}
			}
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						// Create default schedule for new user, on the same connection
						// better-auth just wrote the user row through.
						await createDefaultScheduleForUser(db, user.id);
					}
				}
			}
		}
	});
}

/**
 * The application's auth instance, bound to the shared database singleton.
 *
 * Importing the singleton is safe — no cycle: `db/connection.ts` reaches only
 * `db/config.ts`, `db/dialects/**` and the generated `db/types.ts`, none of
 * which import this module. (The historic "circular import" note guarded a
 * different import: `$lib/db`'s barrel also pulls in the migration runner.
 * Importing `./db/connection` directly avoids that and keeps tsx scripts
 * working.) Sharing the singleton also means one connection pool on Postgres,
 * instead of the second raw handle the better-sqlite3 version opened.
 */
export const auth = createAuth({ db, dialect: activeDbConfig.dialect });
