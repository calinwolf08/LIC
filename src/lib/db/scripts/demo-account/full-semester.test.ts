/**
 * Demos E and F — the full-semester twins — generated end to end, the way the
 * Generate button does it (the real POST /api/schedules/generate handler).
 *
 *   - E has room for every requirement: generation meets them all (counted in
 *     credit, the way the requirements table counts them, so half days are half),
 *     and the saved schedule has no conflicts.
 *   - F is E with three planted gaps. Generation still produces a conflict-free
 *     schedule, meets everything else, and reports each gap — the student, the
 *     clerkship or elective, how many days are missing, and whose availability
 *     to look at — so the coordinator knows what to fix.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../../types';
import { cleanupTestDatabase, createTestDatabaseWithMigrations } from '../../test-utils';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$lib/db', () => ({
	db: new Proxy(
		{},
		{
			get(_t, prop) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const target = holder.db as any;
				const value = target?.[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		}
	)
}));

import { POST } from '../../../../routes/api/schedules/generate/+server';
import { validateSchedule } from '../../../features/scheduling/services/schedule-validation';
import { weekKey } from '../../../features/scheduling/services/scheduling-kind';
import { getPlanProgress } from '../../../features/schedules/services/plan-progress';
import { buildScenario, demoAnchor, type BuiltSchedule } from './builder';
import { DEMO_SCENARIOS } from './scenarios';

const TS = '2026-01-01T00:00:00.000Z';
const USER = 'full-semester-user';

interface Unmet {
	studentName: string;
	clerkshipName: string;
	requirementType: string;
	requiredDays: number;
	assignedDays: number;
	remainingDays: number;
	reason: string;
}

interface Generated {
	success: boolean;
	unmetRequirements: Unmet[];
}

let db: Kysely<DB>;

async function seed(tag: string): Promise<BuiltSchedule> {
	const scenario = DEMO_SCENARIOS.find((s) => s.tag === tag)!;
	const scheduleId = `sched-${tag}`;
	await db
		.insertInto('scheduling_periods')
		.values({
			id: scheduleId,
			name: scenario.name,
			start_date: '2000-01-01',
			end_date: '2000-01-02',
			user_id: USER,
			created_at: TS,
			updated_at: TS
		})
		.execute();
	await db
		.updateTable('user')
		.set({ active_schedule_id: scheduleId })
		.where('id', '=', USER)
		.execute();
	return buildScenario(db, { scheduleId, scenario, start: demoAnchor() });
}

async function generate(schedule: BuiltSchedule): Promise<Generated> {
	const res = await POST({
		locals: { session: { user: { id: USER } }, entitlements: ['autogen'] },
		request: new Request('http://localhost/api/schedules/generate', {
			method: 'POST',
			body: JSON.stringify({
				startDate: schedule.start,
				endDate: schedule.end,
				regenerateFromDate: schedule.start
			}),
			headers: { 'content-type': 'application/json' }
		}),
		url: new URL('http://localhost/api/schedules/generate')
	} as never);
	const body = await res.json();
	expect(res.status, JSON.stringify(body).slice(0, 500)).toBe(200);
	return body.data as Generated;
}

/** Conflicts in the saved schedule, by code. Being off a core preceptor is only a note. */
async function conflicts(scheduleId: string): Promise<Record<string, number>> {
	const { violations } = await validateSchedule(db, scheduleId);
	const out: Record<string, number> = {};
	for (const v of violations) {
		if (v.code !== 'outside_core_preceptor') out[v.code] = (out[v.code] ?? 0) + 1;
	}
	return out;
}

/** Requirements still short, counted in credit the way the requirements table does. */
async function shortfalls(scheduleId: string) {
	const rows = await getPlanProgress(db, scheduleId, USER);
	return rows.filter((r) => r.remaining > 0);
}

describe('Demos E and F: a full semester, generated', () => {
	beforeAll(async () => {
		db = await createTestDatabaseWithMigrations();
		holder.db = db;
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
	}, 60_000);

	afterAll(async () => {
		if (db) await cleanupTestDatabase(db);
	});

	it('E: with room for everything, generation meets every requirement with no conflicts', async () => {
		const schedule = await seed('E');
		const result = await generate(schedule);

		expect(result.unmetRequirements).toEqual([]);
		expect(result.success).toBe(true);
		expect(await conflicts(schedule.scheduleId)).toEqual({});
		expect(await shortfalls(schedule.scheduleId)).toEqual([]);

		// Half days are booked as half days and earn half credit.
		const halfDays = await db
			.selectFrom('schedule_assignments as a')
			.innerJoin('preceptors as p', 'p.id', 'a.preceptor_id')
			.select(['a.session', 'a.credit_value'])
			.where('a.schedule_id', '=', schedule.scheduleId)
			.where('p.name', '=', 'Dr. Kofi Mensah')
			.execute();
		for (const day of halfDays) expect(day).toMatchObject({ session: 'am', credit_value: 0.5 });

		// Each inpatient block (Surgery included, though it is set to team continuity)
		// stays with one preceptor, in weeks that hold no outpatient days.
		const rows = await db
			.selectFrom('schedule_assignments as a')
			.innerJoin('clerkships as c', 'c.id', 'a.clerkship_id')
			.select(['a.student_id', 'a.preceptor_id', 'a.clerkship_id', 'a.date', 'c.scheduling_kind'])
			.where('a.schedule_id', '=', schedule.scheduleId)
			.execute();
		const blockPreceptors = new Map<string, Set<string>>();
		const blockWeeks = new Set<string>();
		for (const r of rows.filter((r) => r.scheduling_kind === 'block')) {
			const key = `${r.student_id}:${r.clerkship_id}`;
			blockPreceptors.set(key, (blockPreceptors.get(key) ?? new Set()).add(r.preceptor_id!));
			blockWeeks.add(`${r.student_id}:${weekKey(r.date)}`);
		}
		expect(blockPreceptors.size).toBe(8 * 3);
		for (const preceptors of blockPreceptors.values()) expect(preceptors.size).toBe(1);
		for (const r of rows.filter((r) => r.scheduling_kind !== 'block')) {
			expect(blockWeeks.has(`${r.student_id}:${weekKey(r.date)}`)).toBe(false);
		}
	}, 300_000);

	it('F: generation reports each planted gap, and only those, with what to fix', async () => {
		const schedule = await seed('F');
		const result = await generate(schedule);
		expect(result.success).toBe(false);

		// Still a conflict-free schedule: the gaps are left open, not forced in.
		expect(await conflicts(schedule.scheduleId)).toEqual({});

		const gap = (u: Unmet) =>
			u.clerkshipName.startsWith('Psychiatry')
				? 'psychiatry'
				: u.clerkshipName.startsWith('Obstetrics & Gynecology')
					? 'obgyn'
					: u.clerkshipName.endsWith('Sports Medicine')
						? 'elective'
						: `unexpected: ${u.clerkshipName}`;
		const byGap = new Map<string, Unmet[]>();
		for (const u of result.unmetRequirements) {
			byGap.set(gap(u), [...(byGap.get(gap(u)) ?? []), u]);
		}
		expect([...byGap.keys()].sort()).toEqual(['elective', 'obgyn', 'psychiatry']);

		// Each one says how short it is and whose availability to look at.
		for (const u of byGap.get('psychiatry')!) {
			expect(u.remainingDays).toBeGreaterThan(0);
			expect(u.reason).toMatch(/of 8 required days/);
			expect(u.reason).toContain('Dr. Ivy Lambert');
			expect(u.reason).toContain('Dr. Kofi Mensah');
		}
		for (const u of byGap.get('obgyn')!) {
			expect(u.requirementType).toBe('inpatient');
			expect(u.reason).toMatch(/[Bb]lock 1/);
			expect(u.reason).toContain('Dr. Grace Liu');
		}
		for (const u of byGap.get('elective')!) {
			expect(u.requirementType).toBe('elective');
			expect(u.reason).toMatch(/of 3 elective days/);
			expect(u.reason).toContain('preceptor pool (Dr. Tom Becker)');
		}

		// The requirements table agrees: only those clerkships are short (Family
		// Medicine through its Sports Medicine elective); everything else is met.
		const short = new Set(
			(await shortfalls(schedule.scheduleId)).map((r) =>
				r.clerkshipName.replace(/ \(Demo F\)$/, '')
			)
		);
		expect(short.has('Psychiatry')).toBe(true);
		expect(short.has('Obstetrics & Gynecology')).toBe(true);
		for (const name of short) {
			expect(['Obstetrics & Gynecology', 'Psychiatry', 'Family Medicine']).toContain(name);
		}

		// --- Act on the Psychiatry message: Dr. Lambert works every weekday and takes
		// two students, as in Demo E. Regenerating closes that gap and only that one.
		const lambert = await db
			.selectFrom('preceptors')
			.select(['id'])
			.where('name', '=', 'Dr. Ivy Lambert')
			.where('email', 'like', '%.f@%')
			.executeTakeFirstOrThrow();
		const slot = await db
			.selectFrom('preceptor_availability')
			.select(['site_id', 'date'])
			.where('preceptor_id', '=', lambert.id)
			.execute();
		const booked = new Set(slot.map((r) => r.date));
		const extra = [];
		for (
			let d = new Date(`${schedule.start}T00:00:00Z`);
			d.toISOString().slice(0, 10) <= schedule.end;
			d.setUTCDate(d.getUTCDate() + 1)
		) {
			const date = d.toISOString().slice(0, 10);
			const day = d.getUTCDay();
			if (day === 0 || day === 6 || booked.has(date)) continue;
			extra.push({
				id: `lambert-${date}`,
				preceptor_id: lambert.id!,
				site_id: slot[0].site_id,
				date,
				is_available: 1,
				session: 'full',
				credit_value: 1,
				created_at: TS,
				updated_at: TS
			});
		}
		await db.insertInto('preceptor_availability').values(extra).execute();
		await db
			.updateTable('preceptors')
			.set({ max_students: 2 })
			.where('id', '=', lambert.id)
			.execute();
		await db
			.updateTable('preceptor_capacity_rules')
			.set({ max_students_per_day: 2 })
			.where('preceptor_id', '=', lambert.id)
			.execute();

		const fixed = await generate(schedule);
		const gaps = new Set(fixed.unmetRequirements.map(gap));
		expect(gaps.has('psychiatry')).toBe(false);
		expect(gaps).toEqual(new Set(['elective', 'obgyn']));
		expect(await conflicts(schedule.scheduleId)).toEqual({});
	}, 300_000);
});
