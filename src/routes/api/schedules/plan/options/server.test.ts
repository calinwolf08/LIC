/**
 * POST /api/schedules/plan/options — the planner's option filter, end to end against
 * the migrated schema: availability (date, session, site), who teaches what, site
 * approval, blackouts, and conflicts with committed rows and other draft pins. Also
 * checks that the planner's dry run reports the same conflicts on a staged pin.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

const holder: { db?: Kysely<DB> } = {};
vi.mock('$lib/db', () => ({
	get db() {
		return holder.db;
	}
}));

import { cleanupTestDatabase, createTestDatabaseWithMigrations } from '$lib/db/test-utils';
import { addPins, clearPins, evaluatePlan } from '$lib/features/schedules/services/plan-service';
import type { PlanOption, PlanOptions } from '$lib/features/schedules/services/plan-options';
import { getPlanProgress } from '$lib/features/schedules/services/plan-progress';
import { POST } from './+server';

const TS = '2026-01-01T00:00:00.000Z';
const USER = 'planner';
const SCHED = 'sched-plan';
const HS = 'hs';
const CLINIC = 'site-clinic';
const HOSPITAL = 'site-hospital';
const FM = 'clerk-fm';
const IM = 'clerk-im';
const DR_FM = 'prec-fm';
const DR_IM = 'prec-im';
const S1 = 'stu-1';
const S2 = 'stu-2';

/** Weekdays a few days out, so nothing is in the past whenever the suite runs. */
function futureWeekdays(count: number): string[] {
	const out: string[] = [];
	for (let n = 3; out.length < count; n++) {
		const d = new Date();
		d.setUTCDate(d.getUTCDate() + n);
		if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
	}
	return out;
}
function daysFromNow(n: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
const [D1, D2, D3, D4] = futureWeekdays(4);

function call(body: unknown, userId: string | null = USER) {
	return POST({
		request: new Request('http://localhost/api/schedules/plan/options', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		locals: {
			session: userId
				? {
						user: { id: userId, email: `${userId}@x.com`, name: userId },
						activeOrganizationId: null
					}
				: null,
			organization: null,
			entitlements: []
		}
	} as never);
}

async function options(selection: Record<string, unknown>): Promise<PlanOptions> {
	const res = await call(selection);
	expect(res.status).toBe(200);
	return (await res.json()).data as PlanOptions;
}

const find = (list: PlanOption[], id: string) => list.find((o) => o.id === id)!;

describe('POST /api/schedules/plan/options', () => {
	beforeAll(async () => {
		holder.db = await createTestDatabaseWithMigrations();
		const db = holder.db;

		await db
			.insertInto('user')
			.values({
				id: USER,
				name: USER,
				email: `${USER}@x.com`,
				emailVerified: 0,
				createdAt: TS,
				updatedAt: TS
			} as never)
			.execute();
		await db
			.insertInto('scheduling_periods')
			.values({
				id: SCHED,
				name: 'Plan',
				start_date: daysFromNow(1),
				end_date: daysFromNow(60),
				user_id: USER,
				created_at: TS,
				updated_at: TS
			})
			.execute();
		await db
			.updateTable('user')
			.set({ active_schedule_id: SCHED })
			.where('id', '=', USER)
			.execute();

		await db
			.insertInto('health_systems')
			.values({ id: HS, name: 'HS', created_at: TS, updated_at: TS })
			.execute();
		for (const [id, name] of [
			[CLINIC, 'Clinic'],
			[HOSPITAL, 'Hospital']
		]) {
			await db
				.insertInto('sites')
				.values({ id, name, health_system_id: HS, created_at: TS, updated_at: TS })
				.execute();
			await db
				.insertInto('schedule_sites')
				.values({ id: `ss-${id}`, schedule_id: SCHED, site_id: id, created_at: TS })
				.execute();
		}
		for (const [id, name] of [
			[FM, 'Family Medicine'],
			[IM, 'Internal Medicine']
		]) {
			await db
				.insertInto('clerkships')
				.values({
					id,
					name,
					clerkship_type: 'outpatient',
					required_days: 20,
					created_at: TS,
					updated_at: TS
				})
				.execute();
			await db
				.insertInto('schedule_clerkships')
				.values({ id: `sc-${id}`, schedule_id: SCHED, clerkship_id: id, created_at: TS })
				.execute();
		}
		// Internal Medicine only runs at the hospital.
		await db
			.insertInto('clerkship_sites')
			.values({ clerkship_id: IM, site_id: HOSPITAL, created_at: TS })
			.execute();

		for (const [id, name, clerkship, site] of [
			[DR_FM, 'Dr. FM', FM, CLINIC],
			[DR_IM, 'Dr. IM', IM, HOSPITAL]
		]) {
			await db
				.insertInto('preceptors')
				.values({
					id,
					name,
					email: `${id}@x.com`,
					max_students: 1,
					created_at: TS,
					updated_at: TS
				})
				.execute();
			await db
				.insertInto('schedule_preceptors')
				.values({ id: `sp-${id}`, schedule_id: SCHED, preceptor_id: id, created_at: TS })
				.execute();
			await db
				.insertInto('preceptor_sites')
				.values({ preceptor_id: id, site_id: site, created_at: TS })
				.execute();
			await db
				.insertInto('preceptor_teams')
				.values({ id: `team-${id}`, clerkship_id: clerkship, created_at: TS, updated_at: TS })
				.execute();
			await db
				.insertInto('preceptor_team_members')
				.values({
					id: `ptm-${id}`,
					team_id: `team-${id}`,
					preceptor_id: id,
					created_at: TS
				})
				.execute();
		}

		// Dr. FM: full days D1, D2 and D4 at the clinic; nothing on D3.
		// Dr. IM: the morning of D1 only, full days D2 and D3, at the hospital.
		const availability: [string, string, string, string][] = [
			[DR_FM, D1, 'full', CLINIC],
			[DR_FM, D2, 'full', CLINIC],
			[DR_FM, D4, 'full', CLINIC],
			[DR_IM, D1, 'am', HOSPITAL],
			[DR_IM, D2, 'full', HOSPITAL],
			[DR_IM, D3, 'full', HOSPITAL]
		];
		for (const [i, [preceptor, date, session, site]] of availability.entries()) {
			await db
				.insertInto('preceptor_availability')
				.values({
					id: `pa-${i}`,
					preceptor_id: preceptor,
					site_id: site,
					date,
					session,
					is_available: 1,
					created_at: TS,
					updated_at: TS
				})
				.execute();
		}

		for (const id of [S1, S2]) {
			await db
				.insertInto('students')
				.values({ id, name: id, email: `${id}@x.com`, created_at: TS, updated_at: TS })
				.execute();
			await db
				.insertInto('schedule_students')
				.values({ id: `sst-${id}`, schedule_id: SCHED, student_id: id, created_at: TS })
				.execute();
		}
	}, 60_000);

	afterAll(async () => {
		if (holder.db) await cleanupTestDatabase(holder.db);
	});

	beforeEach(async () => {
		await clearPins(holder.db!, SCHED, USER);
		await holder.db!.deleteFrom('blackout_dates').execute();
	});

	it('requires a session and a valid selection', async () => {
		expect((await call({}, null)).status).toBe(401);
		expect((await call('not json')).status).toBe(400);
		expect((await call({ dates: ['tomorrow'] })).status).toBe(400);
	});

	it('only offers preceptors who teach the chosen clerkship', async () => {
		const o = await options({ clerkshipId: IM });
		expect(find(o.preceptors, DR_IM).eligible).toBe(true);
		expect(find(o.preceptors, DR_FM)).toMatchObject({
			eligible: false,
			codes: ['preceptor_not_teaching']
		});
		// …and, the other way round, only the clerkships a chosen preceptor teaches.
		const byPreceptor = await options({ preceptorId: DR_FM });
		expect(find(byPreceptor.clerkships, FM).eligible).toBe(true);
		expect(find(byPreceptor.clerkships, IM).eligible).toBe(false);
	});

	it('filters preceptors and dates by availability, including the session', async () => {
		const onD3 = await options({ clerkshipId: FM, dates: [D3] });
		expect(find(onD3.preceptors, DR_FM)).toMatchObject({
			eligible: false,
			codes: ['preceptor_unavailable'],
			reasons: ['Not available']
		});

		const morning = await options({ preceptorId: DR_IM, dates: [D1], session: 'am' });
		expect(morning.dates[0]).toMatchObject({ date: D1, valid: true });
		const fullDay = await options({ preceptorId: DR_IM, dates: [D1], session: 'full' });
		expect(fullDay.dates[0].valid).toBe(false);
		expect(fullDay.dates[0].issues.map((i) => i.code)).toEqual(['preceptor_unavailable']);

		// The open days for a preceptor are exactly the days they can take a student.
		const open = await options({ preceptorId: DR_FM });
		expect(open.openDates).toEqual(expect.arrayContaining([D1, D2, D4]));
		expect(open.openDates).not.toContain(D3);
	});

	it('only offers approved sites where the preceptor works', async () => {
		const o = await options({ clerkshipId: IM });
		expect(find(o.sites, HOSPITAL).eligible).toBe(true);
		expect(find(o.sites, CLINIC)).toMatchObject({
			eligible: false,
			codes: ['site_not_allowed']
		});

		const byPreceptor = await options({ preceptorId: DR_FM, dates: [D1] });
		expect(find(byPreceptor.sites, CLINIC).eligible).toBe(true);
		expect(find(byPreceptor.sites, HOSPITAL).codes).toEqual(['preceptor_wrong_site']);
	});

	it('counts the valid days of a range and says which days fail', async () => {
		const o = await options({ clerkshipId: FM, dates: [D1, D2, D3] });
		expect(find(o.preceptors, DR_FM)).toMatchObject({
			eligible: true,
			validDays: 2,
			totalDays: 3,
			reasons: ['Not available on 1 of 3 days']
		});
	});

	it('excludes choices that clash with other draft pins', async () => {
		await addPins(holder.db!, SCHED, USER, {
			student_id: S1,
			preceptor_id: DR_FM,
			clerkship_id: FM,
			site_id: CLINIC,
			dates: [D1]
		});

		const o = await options({ clerkshipId: FM, dates: [D1] });
		// S1 is already booked on D1 by the draft.
		expect(find(o.students, S1).codes).toEqual(['session_clash']);
		// Dr. FM takes one student a day and the draft has filled D1.
		expect(find(o.preceptors, DR_FM).codes).toEqual(['preceptor_capacity']);
		// With nobody left to take S2 for Family Medicine on D1, S2 is out too.
		expect(find(o.students, S2).codes).toEqual(['no_preceptor']);
	});

	it('excludes blackout dates', async () => {
		await holder
			.db!.insertInto('blackout_dates')
			.values({ id: 'bo', schedule_id: SCHED, date: D2, created_at: TS })
			.execute();
		const o = await options({ preceptorId: DR_FM });
		expect(o.openDates).not.toContain(D2);
		const checked = await options({ preceptorId: DR_FM, dates: [D2] });
		expect(checked.dates[0].issues.map((i) => i.code)).toContain('blackout_date');
	});

	it('flags the same conflicts on a pin staged anyway (the dry run)', async () => {
		await addPins(holder.db!, SCHED, USER, {
			student_id: S2,
			preceptor_id: DR_FM,
			clerkship_id: IM,
			site_id: HOSPITAL,
			dates: [D3]
		});
		const plan = await evaluatePlan(holder.db!, SCHED, USER);
		const status = Object.values(plan.pinStatus)[0];
		expect(new Set(status.unresolved)).toEqual(
			new Set(['preceptor_unavailable', 'preceptor_wrong_site', 'preceptor_not_teaching'])
		);
		expect(status.committable).toBe(false);
	});

	it('colours the date picker for the picked preceptor and student, counting draft pins', async () => {
		await addPins(holder.db!, SCHED, USER, {
			student_id: S1,
			preceptor_id: DR_FM,
			clerkship_id: FM,
			site_id: CLINIC,
			dates: [D1]
		});
		const day = (o: PlanOptions, date: string) => o.days.find((d) => d.date === date)!;

		const fmDays = await options({ preceptorId: DR_FM, studentId: S1 });
		// Dr. FM works D1, D2 and D4; D3 has no availability.
		expect(day(fmDays, D2).state).toBe('available');
		expect(day(fmDays, D3).state).toBe('unavailable');
		// The draft pin books S1 with Dr. FM on D1: the student is busy, Dr. FM is full.
		expect(day(fmDays, D1)).toMatchObject({ studentBusy: true, preceptorAtCapacity: true });
		expect(day(fmDays, D1).preceptorBookings).toEqual([
			expect.objectContaining({ studentId: S1, studentName: S1 })
		]);

		// Session-aware: Dr. IM has only the morning of D1.
		const imMorning = await options({ preceptorId: DR_IM, session: 'am' });
		expect(day(imMorning, D1).state).toBe('available');
		const imFull = await options({ preceptorId: DR_IM, session: 'full' });
		expect(day(imFull, D1).state).toBe('unavailable');

		// Without a preceptor, a day is "available" when someone could take it.
		const anyone = await options({ clerkshipId: FM });
		expect(day(anyone, D2).state).toBe('available');
		expect(day(anyone, D3).state).toBe('unset');
	});

	it('reports requirement progress: saved + planned (in credit) vs required', async () => {
		await addPins(holder.db!, SCHED, USER, {
			student_id: S2,
			preceptor_id: DR_FM,
			clerkship_id: FM,
			site_id: CLINIC,
			dates: [D1, D2]
		});
		await addPins(holder.db!, SCHED, USER, {
			student_id: S2,
			preceptor_id: DR_IM,
			clerkship_id: IM,
			site_id: HOSPITAL,
			dates: [D1],
			session: 'am',
			credit_value: 0.5
		});
		const rows = await getPlanProgress(holder.db!, SCHED, USER);
		const row = (student: string, clerkship: string) =>
			rows.find((r) => r.studentId === student && r.clerkshipId === clerkship)!;

		expect(rows).toHaveLength(4); // 2 students × 2 clerkships
		expect(row(S2, FM)).toMatchObject({
			required: 20,
			assigned: 0,
			planned: 2,
			remaining: 18,
			over: 0
		});
		expect(row(S2, IM)).toMatchObject({ planned: 0.5, remaining: 19.5 });
		expect(row(S1, FM)).toMatchObject({ planned: 0, remaining: 20 });

		// The draft holds all three pins the progress counted.
		const plan = await evaluatePlan(holder.db!, SCHED, USER);
		expect(plan.pins).toHaveLength(3);
	});
});
