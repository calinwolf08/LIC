import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '../test-utils';
import { resetUser, resetAll, ResetError } from './reset-lib';

const ts = '2026-01-01T00:00:00.000Z';

/**
 * Create a self-contained tenant: a user, a schedule they own, one of every
 * entity, the junction rows linking those entities to the schedule, an
 * assignment, and better-auth session/account rows. Ids are namespaced by
 * `key` so two tenants never collide.
 */
async function makeTenant(db: Kysely<DB>, key: string) {
	const id = (suffix: string) => `${key}-${suffix}`;
	const email = `${key}@example.com`;

	await db
		.insertInto('user')
		.values({
			id: id('user'),
			name: key,
			email,
			emailVerified: 0,
			createdAt: ts,
			updatedAt: ts,
		})
		.execute();
	await db
		.insertInto('session')
		.values({
			id: id('session'),
			userId: id('user'),
			token: id('token'),
			expiresAt: ts,
			createdAt: ts,
			updatedAt: ts,
		})
		.execute();
	await db
		.insertInto('account')
		.values({
			id: id('account'),
			userId: id('user'),
			accountId: id('acct'),
			providerId: 'credential',
			createdAt: ts,
			updatedAt: ts,
		})
		.execute();
	await db
		.insertInto('verification')
		.values({
			id: id('ver'),
			identifier: email,
			value: 'x',
			expiresAt: ts,
			createdAt: ts,
			updatedAt: ts,
		})
		.execute();

	await db
		.insertInto('scheduling_periods')
		.values({
			id: id('sched'),
			name: `${key} schedule`,
			start_date: '2026-01-01',
			end_date: '2026-12-31',
			user_id: id('user'),
			created_at: ts,
			updated_at: ts,
		})
		.execute();

	await db
		.insertInto('health_systems')
		.values({ id: id('hs'), name: `${key} HS`, created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({
			id: id('site'),
			name: `${key} Site`,
			health_system_id: id('hs'),
			created_at: ts,
			updated_at: ts,
		})
		.execute();
	await db
		.insertInto('students')
		.values({
			id: id('student'),
			name: `${key} Student`,
			email: `${key}-student@x.com`,
			created_at: ts,
			updated_at: ts,
		})
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: id('prec'),
			name: `${key} Prec`,
			email: `${key}-prec@x.com`,
			max_students: 1,
			health_system_id: id('hs'),
			created_at: ts,
			updated_at: ts,
		})
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: id('clerk'),
			name: `${key} Clerkship`,
			clerkship_type: 'outpatient',
			required_days: 10,
			created_at: ts,
			updated_at: ts,
		})
		.execute();

	// Dependent per-entity rows to prove they get cleaned up.
	await db
		.insertInto('preceptor_availability')
		.values({
			id: id('av'),
			preceptor_id: id('prec'),
			site_id: id('site'),
			date: '2026-02-01',
			is_available: 1,
			created_at: ts,
			updated_at: ts,
		})
		.execute();
	await db
		.insertInto('preceptor_sites')
		.values({ preceptor_id: id('prec'), site_id: id('site'), created_at: ts })
		.execute();
	await db
		.insertInto('student_health_system_onboarding')
		.values({
			id: id('onb'),
			student_id: id('student'),
			health_system_id: id('hs'),
			is_completed: 1,
			created_at: ts,
			updated_at: ts,
		})
		.execute();

	// Junctions linking every entity to the schedule.
	await db
		.insertInto('schedule_students')
		.values({ id: id('js'), schedule_id: id('sched'), student_id: id('student'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values({ id: id('jc'), schedule_id: id('sched'), clerkship_id: id('clerk'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_health_systems')
		.values({ id: id('jhs'), schedule_id: id('sched'), health_system_id: id('hs'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values({ id: id('jp'), schedule_id: id('sched'), preceptor_id: id('prec'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_sites')
		.values({ id: id('jst'), schedule_id: id('sched'), site_id: id('site'), created_at: ts })
		.execute();

	// One assignment for this tenant's student.
	await db
		.insertInto('schedule_assignments')
		.values({
			id: id('asg'),
			student_id: id('student'),
			preceptor_id: id('prec'),
			clerkship_id: id('clerk'),
			site_id: id('site'),
			date: '2026-02-01',
			created_at: ts,
			updated_at: ts,
		})
		.execute();
}

async function count(db: Kysely<DB>, table: keyof DB): Promise<number> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const row = await (db as any)
		.selectFrom(table)
		.select((db as any).fn.countAll().as('c'))
		.executeTakeFirst();
	return Number(row?.c ?? 0);
}

describe('resetUser', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await makeTenant(db, 'alice');
		await makeTenant(db, 'bob');
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it("removes user A and everything it owns, leaving every one of B's rows", async () => {
		const result = await resetUser(db, 'alice@example.com');

		// Alice gone.
		expect(await count(db, 'user')).toBe(1);
		expect(
			await db.selectFrom('user').select('id').where('email', '=', 'alice@example.com').executeTakeFirst()
		).toBeUndefined();
		// A migration seeds an ownerless `default-2026` schedule; it must survive
		// (reset-user only touches the target's own rows). So bob's schedule + the
		// seed remain, and alice's is gone.
		expect(
			await db.selectFrom('scheduling_periods').select('id').where('id', '=', 'alice-sched').executeTakeFirst()
		).toBeUndefined();
		expect(
			await db.selectFrom('scheduling_periods').select('id').where('id', '=', 'bob-sched').executeTakeFirst()
		).toBeDefined();
		expect(await count(db, 'schedule_assignments')).toBe(1);
		expect(await count(db, 'schedule_students')).toBe(1);
		expect(await count(db, 'students')).toBe(1);
		expect(await count(db, 'preceptors')).toBe(1);
		expect(await count(db, 'clerkships')).toBe(1);
		expect(await count(db, 'sites')).toBe(1);
		expect(await count(db, 'health_systems')).toBe(1);
		expect(await count(db, 'preceptor_availability')).toBe(1);
		expect(await count(db, 'preceptor_sites')).toBe(1);
		expect(await count(db, 'student_health_system_onboarding')).toBe(1);
		expect(await count(db, 'session')).toBe(1);
		expect(await count(db, 'account')).toBe(1);
		expect(await count(db, 'verification')).toBe(1);

		// Bob fully intact.
		const bob = await db
			.selectFrom('user')
			.select('id')
			.where('email', '=', 'bob@example.com')
			.executeTakeFirst();
		expect(bob?.id).toBe('bob-user');

		// Reported counts reflect what was removed.
		expect(result.counts['user']).toBe(1);
		expect(result.counts['schedule_assignments']).toBe(1);
		expect(result.dryRun).toBe(false);
	});

	it('keeps an entity shared with another user (only removes the junction row)', async () => {
		// Attach Alice's clerkship to Bob's schedule too.
		await db
			.insertInto('schedule_clerkships')
			.values({
				id: 'shared-jc',
				schedule_id: 'bob-sched',
				clerkship_id: 'alice-clerk',
				created_at: ts,
			})
			.execute();

		await resetUser(db, 'alice@example.com');

		// The clerkship survives because Bob still references it.
		expect(
			await db
				.selectFrom('clerkships')
				.select('id')
				.where('id', '=', 'alice-clerk')
				.executeTakeFirst()
		).toBeDefined();
		// Bob's junction row survives; Alice's is gone.
		expect(await count(db, 'schedule_clerkships')).toBe(2); // bob's own + the shared one
		expect(
			await db
				.selectFrom('schedule_clerkships')
				.select('id')
				.where('schedule_id', '=', 'alice-sched')
				.executeTakeFirst()
		).toBeUndefined();
	});

	it('does not delete assignments of a student shared with another user', async () => {
		// Share Alice's student with Bob's schedule.
		await db
			.insertInto('schedule_students')
			.values({
				id: 'shared-js',
				schedule_id: 'bob-sched',
				student_id: 'alice-student',
				created_at: ts,
			})
			.execute();

		await resetUser(db, 'alice@example.com');

		// Student survives, and so does the assignment attached to that student.
		expect(
			await db.selectFrom('students').select('id').where('id', '=', 'alice-student').executeTakeFirst()
		).toBeDefined();
		expect(
			await db
				.selectFrom('schedule_assignments')
				.select('id')
				.where('id', '=', 'alice-asg')
				.executeTakeFirst()
		).toBeDefined();
	});

	it('throws and changes nothing for an unknown email', async () => {
		const before = await count(db, 'user');
		await expect(resetUser(db, 'nobody@example.com')).rejects.toBeInstanceOf(ResetError);
		expect(await count(db, 'user')).toBe(before);
	});

	it('dry-run reports non-zero counts and mutates nothing', async () => {
		const result = await resetUser(db, 'alice@example.com', { dryRun: true });

		expect(result.dryRun).toBe(true);
		expect(result.counts['user']).toBe(1);
		expect(result.counts['schedule_assignments']).toBe(1);
		expect(result.counts['students']).toBe(1);

		// Nothing removed.
		expect(await count(db, 'user')).toBe(2);
		expect(await count(db, 'schedule_assignments')).toBe(2);
		expect(await count(db, 'students')).toBe(2);
	});
});

describe('resetAll', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await makeTenant(db, 'alice');
		await makeTenant(db, 'bob');
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('empties every table', async () => {
		const result = await resetAll(db);
		expect(result.counts['user']).toBe(2);
		for (const table of ['user', 'scheduling_periods', 'students', 'schedule_assignments'] as const) {
			expect(await count(db, table)).toBe(0);
		}
	});

	it('dry-run mutates nothing', async () => {
		await resetAll(db, { dryRun: true });
		expect(await count(db, 'user')).toBe(2);
		expect(await count(db, 'students')).toBe(2);
	});
});
