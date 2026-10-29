/**
 * The demo account seeder and its assignment clearer, on every engine (SQLite
 * and PGlite), against the full migrated schema.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createAuth } from '../../../auth';
import { createManualProvider } from '../../../server/billing/providers/manual';
import { createBillingService } from '../../../server/billing/service';
import { createBetterAuthIdentity } from '../../../server/identity/better-auth/identity';
import { ENGINES } from '../../../server/testing/engines';
import { migrateToLatest } from '../../migrations';
import type { DB } from '../../types';
import { ensureAuthTables } from '../ensure-auth-tables';
import {
	clearDemoAssignments,
	DEFAULT_DEMO_EMAIL,
	DemoAccountError,
	DEMO_ORGANIZATION_NAME,
	seedDemoAccount
} from './account';
import { DEMO_SCENARIOS } from './scenarios';

process.env.BETTER_AUTH_SECRET ||= 'demo-account-test-secret-demo-account';

const PASSWORD = 'demo-pass-123';
const TODAY = new Date('2026-10-19T12:00:00Z');

describe.each(ENGINES)('demo account on $dialect', ({ dialect, connect }) => {
	let db: Kysely<DB>;
	let services: Parameters<typeof seedDemoAccount>[1];

	beforeAll(async () => {
		db = await connect();
		await ensureAuthTables(db, dialect);
		await migrateToLatest(db, { silent: true } as never);
		services = {
			identity: createBetterAuthIdentity({ auth: createAuth({ db, dialect }), db }),
			billing: createBillingService({ db, provider: createManualProvider() })
		};
	}, 120_000);

	afterAll(async () => {
		await db?.destroy();
	});

	async function countFor(table: keyof DB, scheduleIds: string[]) {
		const rows = await db
			.selectFrom(table as 'schedule_students')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', 'in', scheduleIds)
			.executeTakeFirst();
		return Number(rows?.c ?? 0);
	}

	async function tableCount(table: keyof DB) {
		const row = await db
			.selectFrom(table as 'students')
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.executeTakeFirst();
		return Number(row?.c ?? 0);
	}

	it(
		'creates the account, its organization on Pro, and one schedule per scenario with no assignments',
		{ timeout: 60_000 },
		async () => {
			const result = await seedDemoAccount(db, services, { password: PASSWORD, today: TODAY });

			expect(result.email).toBe(DEFAULT_DEMO_EMAIL);
			expect(result.replacedExisting).toBe(false);
			expect(result.schedules.map((s) => s.name)).toEqual(DEMO_SCENARIOS.map((s) => s.name));

			// Dated in the future (first Monday ≥ 14 days out), never in the past.
			for (const s of result.schedules) expect(s.start).toBe('2026-11-02');

			const scheduleIds = result.schedules.map((s) => s.scheduleId);
			const owned = await db
				.selectFrom('scheduling_periods')
				.select('id')
				.where('user_id', '=', result.userId)
				.execute();
			expect(owned.map((r) => r.id).sort()).toEqual([...scheduleIds].sort());

			const user = await db
				.selectFrom('user')
				.select('active_schedule_id')
				.where('id', '=', result.userId)
				.executeTakeFirstOrThrow();
			expect(user.active_schedule_id).toBe(scheduleIds[0]);

			expect(await services.identity.listMemberships(result.userId)).toEqual([
				{
					organizationId: result.organizationId,
					organizationName: DEMO_ORGANIZATION_NAME,
					role: 'owner'
				}
			]);
			expect(await services.billing.entitlementsFor(result.organizationId)).toEqual(['autogen']);

			const totalStudents = DEMO_SCENARIOS.reduce((n, s) => n + s.students.length, 0);
			expect(await countFor('schedule_students', scheduleIds)).toBe(totalStudents);
			expect(await countFor('schedule_assignments', scheduleIds)).toBe(0);
			const total = (pick: (s: (typeof DEMO_SCENARIOS)[number]) => unknown[] | undefined) =>
				DEMO_SCENARIOS.reduce((n, s) => n + (pick(s)?.length ?? 0), 0);
			expect(await countFor('schedule_quarters', scheduleIds)).toBe(total((s) => s.quarters));
			expect(await countFor('blackout_dates', scheduleIds)).toBe(total((s) => s.blackouts));
		}
	);

	it(
		'rebuilds an existing demo account from scratch, leaving no duplicates',
		{ timeout: 60_000 },
		async () => {
			const before = {
				students: await tableCount('students'),
				clerkships: await tableCount('clerkships'),
				availability: await tableCount('preceptor_availability'),
				organizations: await tableCount('organization')
			};

			const result = await seedDemoAccount(db, services, { password: PASSWORD, today: TODAY });

			expect(result.replacedExisting).toBe(true);
			expect({
				students: await tableCount('students'),
				clerkships: await tableCount('clerkships'),
				availability: await tableCount('preceptor_availability'),
				organizations: await tableCount('organization')
			}).toEqual(before);
		}
	);

	it('refuses to replace an existing account outside the demo domain without --force', async () => {
		await services.identity.signUpWithEmail({
			name: 'Real Coordinator',
			email: 'real@school.edu',
			password: PASSWORD
		});

		const error = await seedDemoAccount(db, services, {
			email: 'real@school.edu',
			password: PASSWORD,
			today: TODAY
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(DemoAccountError);
		expect(
			await db.selectFrom('user').select('id').where('email', '=', 'real@school.edu').execute()
		).toHaveLength(1);
	});

	it(
		'clears assignments, planner drafts and runs for that account only',
		{ timeout: 60_000 },
		async () => {
			const other = await seedDemoAccount(db, services, {
				email: 'second@demo.lic.test',
				password: PASSWORD,
				today: TODAY
			});
			const mine = await db
				.selectFrom('user')
				.select('id')
				.where('email', '=', DEFAULT_DEMO_EMAIL)
				.executeTakeFirstOrThrow();

			/** Book one assignment in the first schedule of `userId`. */
			async function bookOne(userId: string) {
				const schedule = await db
					.selectFrom('scheduling_periods')
					.select(['id', 'start_date'])
					.where('user_id', '=', userId)
					.where('name', '=', DEMO_SCENARIOS[0].name)
					.executeTakeFirstOrThrow();
				const student = await db
					.selectFrom('schedule_students')
					.select('student_id')
					.where('schedule_id', '=', schedule.id!)
					.executeTakeFirstOrThrow();
				const preceptor = await db
					.selectFrom('schedule_preceptors')
					.innerJoin(
						'preceptor_sites',
						'preceptor_sites.preceptor_id',
						'schedule_preceptors.preceptor_id'
					)
					.select(['schedule_preceptors.preceptor_id', 'preceptor_sites.site_id'])
					.where('schedule_preceptors.schedule_id', '=', schedule.id!)
					.executeTakeFirstOrThrow();
				const clerkship = await db
					.selectFrom('schedule_clerkships')
					.select('clerkship_id')
					.where('schedule_id', '=', schedule.id!)
					.executeTakeFirstOrThrow();
				const ts = new Date().toISOString();
				await db
					.insertInto('schedule_assignments')
					.values({
						id: crypto.randomUUID(),
						schedule_id: schedule.id,
						student_id: student.student_id,
						preceptor_id: preceptor.preceptor_id,
						clerkship_id: clerkship.clerkship_id,
						site_id: preceptor.site_id,
						date: schedule.start_date,
						created_at: ts,
						updated_at: ts
					} as never)
					.execute();
				await db
					.insertInto('generation_runs')
					.values({
						id: crypto.randomUUID(),
						schedule_id: schedule.id!,
						user_id: userId,
						created_at: ts,
						mode: 'full',
						options_json: '{}',
						plan_json: '{}',
						result_json: '{}',
						success: 1
					})
					.execute();
			}

			await bookOne(mine.id);
			await bookOne(other.userId);

			const dry = await clearDemoAssignments(db, { dryRun: true });
			expect(dry.counts).toEqual({ assignments: 1, planPins: 0, generationRuns: 1 });
			expect(await tableCount('schedule_assignments')).toBe(2);

			const cleared = await clearDemoAssignments(db);
			expect(cleared).toMatchObject({
				email: DEFAULT_DEMO_EMAIL,
				schedules: DEMO_SCENARIOS.length,
				counts: { assignments: 1, planPins: 0, generationRuns: 1 },
				dryRun: false
			});

			// The other account's assignment and run survive; setup is untouched.
			expect(await tableCount('schedule_assignments')).toBe(1);
			expect(await tableCount('generation_runs')).toBe(1);
			expect(await tableCount('students')).toBeGreaterThan(0);
		}
	);

	it('reports a missing account clearly', async () => {
		await expect(clearDemoAssignments(db, { email: 'nobody@demo.lic.test' })).rejects.toThrow(
			DemoAccountError
		);
	});
});
