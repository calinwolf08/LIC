/**
 * Sign-up works on every supported engine.
 *
 * This is the regression guard for the bug that started the dialect work: a
 * fresh PostgreSQL database 500'd on the first sign-up because the auth wiring
 * and the auth DDL were both SQLite-shaped. So the test drives the REAL
 * better-auth sign-up endpoint — the same call the seed script and the register
 * form make — against both engines:
 *
 *   SQLite    better-sqlite3, in-memory
 *   Postgres  PGlite (real PostgreSQL 18.3, in-process WASM — no server, no Docker)
 *
 * It deliberately does NOT run the migration history: `ensureAuthTables` plus the
 * handful of columns the hook touches is everything sign-up needs, and keeping
 * the migrations out makes the test independent of the per-dialect migration
 * folders and fast enough for the default suite.
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { createAuth } from './auth';
import { createDB, createDBFromDialect } from './db/connection';
import { getDialectAdapter } from './db/dialects/index';
import type { DbDialectName } from './db/dialects/types';
import { ensureAuthTables } from './db/scripts/ensure-auth-tables';
import type { DB } from './db/types';

// better-auth otherwise generates a throwaway secret and warns on every call.
process.env.BETTER_AUTH_SECRET ||= 'auth-signup-test-secret-auth-signup-test';

/**
 * The app-owned parts of the schema the signup hook depends on, which live in
 * migrations rather than in the auth DDL: the two extra `user` columns
 * (migrations 024/026) and `scheduling_periods` (migration 001, as scoped by
 * 022/023). Built from the dialect's own type map, exactly as the migrations do.
 */
async function createAppTables(db: Kysely<DB>, dialect: DbDialectName): Promise<void> {
	const t = getDialectAdapter(dialect).columnTypes;

	await db.schema.alterTable('user').addColumn('active_schedule_id', sql.raw(t.text)).execute();
	await db.schema
		.alterTable('user')
		.addColumn('entitlements', sql.raw(t.text), (col) => col.defaultTo('[]'))
		.execute();

	await db.schema
		.createTable('scheduling_periods')
		.addColumn('id', sql.raw(t.text), (col) => col.primaryKey())
		.addColumn('name', sql.raw(t.text), (col) => col.notNull())
		.addColumn('start_date', sql.raw(t.text), (col) => col.notNull())
		.addColumn('end_date', sql.raw(t.text), (col) => col.notNull())
		.addColumn('year', sql.raw(t.integer))
		.addColumn('user_id', sql.raw(t.text), (col) => col.references('user.id'))
		.addColumn('is_active', sql.raw(t.boolean), (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', sql.raw(t.timestamp), (col) => col.notNull())
		.addColumn('updated_at', sql.raw(t.timestamp), (col) => col.notNull())
		.execute();
}

/** The date range the hook is specified to produce, recomputed independently. */
function expectedAcademicYear(now = new Date()) {
	const year = now.getFullYear();
	return now.getMonth() >= 6
		? { start: `${year}-07-01`, end: `${year + 1}-06-30` }
		: { start: `${year}-01-01`, end: `${year}-12-31` };
}

const engines: Array<{ dialect: DbDialectName; connect: () => Promise<Kysely<DB>> }> = [
	{
		dialect: 'sqlite',
		connect: async () => createDB(':memory:')
	},
	{
		dialect: 'postgres',
		connect: async () => {
			// Imported lazily so the SQLite lane never pays for booting the WASM
			// Postgres build.
			const { KyselyPGlite } = await import('kysely-pglite');
			const { dialect } = await KyselyPGlite.create();
			return createDBFromDialect(dialect);
		}
	}
];

describe.each(engines)('better-auth sign-up on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;
	let auth: ReturnType<typeof createAuth>;

	beforeAll(async () => {
		db = await connect();
		await ensureAuthTables(db, dialect);
		await createAppTables(db, dialect);
		auth = createAuth({ db, dialect });
	}, 60_000);

	afterAll(async () => {
		await db?.destroy();
	});

	it('creates the user, a default schedule, and links the two', async () => {
		const email = `signup-${dialect}@example.com`;

		const result = await auth.api.signUpEmail({
			body: { name: 'Signup Test', email, password: 'password12345' }
		});

		expect(result.user.id).toBeTruthy();

		const user = await db
			.selectFrom('user')
			.select(['id', 'email', 'active_schedule_id', 'entitlements'])
			.where('email', '=', email)
			.executeTakeFirst();
		expect(user).toBeDefined();
		expect(user?.id).toBe(result.user.id);
		expect(user?.entitlements).toBe('[]');

		const schedule = await db
			.selectFrom('scheduling_periods')
			.selectAll()
			.where('user_id', '=', result.user.id)
			.executeTakeFirst();
		expect(schedule).toBeDefined();
		expect(schedule?.name).toBe('My Schedule');
		expect(schedule?.is_active).toBe(0);

		const range = expectedAcademicYear();
		expect(schedule?.start_date).toBe(range.start);
		expect(schedule?.end_date).toBe(range.end);

		// The link is the point of the hook: the app resolves the active schedule
		// from this column on every request.
		expect(user?.active_schedule_id).toBe(schedule?.id);
	});

	// Sign-up + sign-in run argon2 password hashing twice; under v8 coverage
	// instrumentation that is ~6s, past the default 5s test timeout, so give this
	// one a generous budget (it stays fast in an uninstrumented run).
	it('signs the new user back in', { timeout: 30000 }, async () => {
		const email = `signin-${dialect}@example.com`;
		await auth.api.signUpEmail({
			body: { name: 'Signin Test', email, password: 'password12345' }
		});

		// Proves the session row round-trips too — session expiry is the other
		// place where an engine-inappropriate column type bites.
		const session = await auth.api.signInEmail({
			body: { email, password: 'password12345' }
		});
		expect(session.user.email).toBe(email);
	});

	it('still registers the user when the schedule cannot be created', async () => {
		// A throwing `after` hook would fail the whole sign-up, so the hook
		// swallows its errors. Remove the table it writes to and prove it.
		await db.schema.dropTable('scheduling_periods').execute();
		try {
			const email = `resilient-${dialect}@example.com`;
			const result = await auth.api.signUpEmail({
				body: { name: 'Resilient', email, password: 'password12345' }
			});
			expect(result.user.id).toBeTruthy();

			const user = await db
				.selectFrom('user')
				.select('active_schedule_id')
				.where('email', '=', email)
				.executeTakeFirst();
			expect(user?.active_schedule_id).toBeNull();
		} finally {
			await createAppTables_schedulingPeriodsOnly(db, dialect);
		}
	});
});

/** Restore just `scheduling_periods` after the resilience test drops it. */
async function createAppTables_schedulingPeriodsOnly(
	db: Kysely<DB>,
	dialect: DbDialectName
): Promise<void> {
	const t = getDialectAdapter(dialect).columnTypes;
	await db.schema
		.createTable('scheduling_periods')
		.ifNotExists()
		.addColumn('id', sql.raw(t.text), (col) => col.primaryKey())
		.addColumn('name', sql.raw(t.text), (col) => col.notNull())
		.addColumn('start_date', sql.raw(t.text), (col) => col.notNull())
		.addColumn('end_date', sql.raw(t.text), (col) => col.notNull())
		.addColumn('year', sql.raw(t.integer))
		.addColumn('user_id', sql.raw(t.text), (col) => col.references('user.id'))
		.addColumn('is_active', sql.raw(t.boolean), (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', sql.raw(t.timestamp), (col) => col.notNull())
		.addColumn('updated_at', sql.raw(t.timestamp), (col) => col.notNull())
		.execute();
}
