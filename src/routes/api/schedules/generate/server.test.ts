/**
 * POST /api/schedules/generate — real-handler integration tests.
 *
 * Phase 0 of the schedule-generation review. Unlike the previous version (which
 * mocked the engine and every service and so could not observe behaviour), this
 * drives the real handler against an in-memory migrated database, following the
 * Proxy-mock pattern from `tenant-isolation-api.test.ts`. Each test targets a
 * verified finding:
 *   F-01 credit · F-02 tenant scope · F-06 unmet from accepted · F-07 capacity ·
 *   F-14 persisted site/elective/source/schedule_id · F-23 no active schedule.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { nanoid } from 'nanoid';

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

import { POST } from './+server';

let db: Kysely<DB>;
const ts = '2026-01-01T00:00:00.000Z';

/** Weekday date strings from `start`, `count` of them. */
function weekdays(start: string, count: number): string[] {
	const out: string[] = [];
	const d = new Date(start + 'T00:00:00.000Z');
	while (out.length < count) {
		const dow = d.getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return out;
}

interface Tenant {
	userId: string;
	scheduleId: string;
	hsId: string;
	siteId: string;
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	teamId: string;
}

async function makeTenant(
	key: string,
	opts: {
		requiredDays?: number;
		maxStudents?: number;
		availability?: string[];
		scheduleStart?: string;
		scheduleEnd?: string;
	} = {}
): Promise<Tenant> {
	const id = (s: string) => `${key}-${s}-${nanoid(6)}`;
	const t: Tenant = {
		userId: id('user'),
		scheduleId: id('sched'),
		hsId: id('hs'),
		siteId: id('site'),
		studentId: id('student'),
		preceptorId: id('prec'),
		clerkshipId: id('clerk'),
		teamId: id('team')
	};
	const start = opts.scheduleStart ?? '2026-03-01';
	const end = opts.scheduleEnd ?? '2026-06-30';
	await db
		.insertInto('user')
		.values({
			id: t.userId,
			name: key,
			email: `${key}-${nanoid(4)}@x.com`,
			emailVerified: 0,
			createdAt: ts,
			updatedAt: ts,
			active_schedule_id: t.scheduleId,
			entitlements: JSON.stringify(['autogen'])
		})
		.execute();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: t.scheduleId,
			name: `${key} schedule`,
			start_date: start,
			end_date: end,
			user_id: t.userId,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: t.hsId, name: `${key} HS`, created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({
			id: t.siteId,
			name: `${key} site`,
			health_system_id: t.hsId,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values({ id: t.studentId, name: `${key} student`, email: `${t.studentId}@x.com` })
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: t.preceptorId,
			name: `${key} preceptor`,
			email: `${t.preceptorId}@x.com`,
			health_system_id: t.hsId,
			max_students: opts.maxStudents ?? 1
		})
		.execute();
	await db
		.insertInto('preceptor_sites')
		.values({ preceptor_id: t.preceptorId, site_id: t.siteId })
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: t.clerkshipId,
			name: `${key} clerkship`,
			clerkship_type: 'outpatient',
			required_days: opts.requiredDays ?? 5
		})
		.execute();
	await db
		.insertInto('preceptor_teams')
		.values({
			id: t.teamId,
			clerkship_id: t.clerkshipId,
			name: `${key} team`,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('preceptor_team_members')
		.values({
			id: id('tm'),
			team_id: t.teamId,
			preceptor_id: t.preceptorId,
			priority: 1,
			created_at: ts
		})
		.execute();
	const avail = opts.availability ?? weekdays('2026-03-02', 30);
	if (avail.length > 0) {
		await db
			.insertInto('preceptor_availability')
			.values(
				avail.map((date) => ({
					id: id('av'),
					preceptor_id: t.preceptorId,
					site_id: t.siteId,
					date,
					is_available: 1
				}))
			)
			.execute();
	}
	for (const [table, col, val] of [
		['schedule_students', 'student_id', t.studentId],
		['schedule_preceptors', 'preceptor_id', t.preceptorId],
		['schedule_clerkships', 'clerkship_id', t.clerkshipId],
		['schedule_sites', 'site_id', t.siteId],
		['schedule_health_systems', 'health_system_id', t.hsId],
		['schedule_teams', 'team_id', t.teamId]
	] as const) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (db as any)
			.insertInto(table)
			.values({ id: nanoid(), schedule_id: t.scheduleId, [col]: val, created_at: ts })
			.execute();
	}
	return t;
}

async function addAssignment(
	t: Tenant,
	date: string,
	opts: { locked?: number; source?: string } = {}
): Promise<string> {
	const id = nanoid();
	await db
		.insertInto('schedule_assignments')
		.values({
			id,
			schedule_id: t.scheduleId,
			student_id: t.studentId,
			preceptor_id: t.preceptorId,
			clerkship_id: t.clerkshipId,
			site_id: t.siteId,
			date,
			status: 'scheduled',
			locked: opts.locked ?? 0,
			source: opts.source ?? 'manual'
		})
		.execute();
	return id;
}

function post(userId: string | null, body: Record<string, unknown>, entitled = true) {
	return POST({
		locals: {
			session: userId ? { user: { id: userId } } : null,
			entitlements: entitled ? ['autogen'] : []
		},
		request: new Request('http://localhost/api/schedules/generate', {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' }
		}),
		url: new URL('http://localhost/api/schedules/generate')
	} as never);
}

function rows(scheduleId: string) {
	return db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('schedule_id', '=', scheduleId)
		.orderBy('date')
		.execute();
}

beforeEach(async () => {
	db = await createTestDatabaseWithMigrations();
	holder.db = db as unknown;
});
afterEach(async () => cleanupTestDatabase(db));

describe('POST /api/schedules/generate', () => {
	describe('gating & scope', () => {
		it('rejects a non-entitled user with 403', async () => {
			const t = await makeTenant('a');
			await expect(
				post(t.userId, { startDate: '2026-03-01', endDate: '2026-06-30' }, false)
			).rejects.toMatchObject({ status: 403 });
		});

		it('returns 400 when the caller has no active schedule', async () => {
			const userId = `nosched-${nanoid(6)}`;
			await db
				.insertInto('user')
				.values({
					id: userId,
					name: 'n',
					email: `${userId}@x.com`,
					emailVerified: 0,
					createdAt: ts,
					updatedAt: ts,
					entitlements: JSON.stringify(['autogen'])
				})
				.execute();
			await expect(
				post(userId, { startDate: '2026-03-01', endDate: '2026-06-30' })
			).rejects.toMatchObject({
				status: 400
			});
		});

		it('rejects a range outside the schedule range (400)', async () => {
			const t = await makeTenant('a', { scheduleStart: '2026-03-01', scheduleEnd: '2026-03-31' });
			const res = await post(t.userId, { startDate: '2026-03-01', endDate: '2026-12-31' });
			expect(res.status).toBe(400);
		});
	});

	describe('full-reoptimize', () => {
		it('generates the required days and persists site_id, source and schedule_id (F-14)', async () => {
			const t = await makeTenant('a', { requiredDays: 5 });
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-01'
			});
			expect(res.status).toBe(200);
			const all = await rows(t.scheduleId);
			expect(all.length).toBe(5);
			for (const a of all) {
				expect(a.source).toBe('generated');
				expect(a.schedule_id).toBe(t.scheduleId);
				expect(a.site_id).toBe(t.siteId);
			}
		});

		it('credits past assignments instead of re-scheduling them (F-01)', async () => {
			const t = await makeTenant('a', { requiredDays: 5 });
			// Two past days, before a future cutoff.
			await addAssignment(t, '2026-03-02');
			await addAssignment(t, '2026-03-03');
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-16'
			});
			expect(res.status).toBe(200);
			const all = await rows(t.scheduleId);
			// 2 credited past + 3 newly generated = exactly the required 5.
			expect(all.length).toBe(5);
		});

		it('preserves a locked assignment and credits it (F-01)', async () => {
			const t = await makeTenant('a', { requiredDays: 5 });
			const lockedId = await addAssignment(t, '2026-03-10', { locked: 1 });
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-01'
			});
			expect(res.status).toBe(200);
			const all = await rows(t.scheduleId);
			expect(all.some((a) => a.id === lockedId)).toBe(true);
			expect(all.length).toBe(5);
		});
	});

	describe('completion', () => {
		it('keeps existing assignments and only fills the gap (F-01)', async () => {
			const t = await makeTenant('a', { requiredDays: 5 });
			await addAssignment(t, '2026-03-02');
			await addAssignment(t, '2026-03-03');
			await addAssignment(t, '2026-03-04');
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				strategy: 'completion'
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			expect(body.data.newAssignmentsGenerated).toBe(2);
			expect(body.data.existingAssignmentsPreserved).toBe(3);
			expect((await rows(t.scheduleId)).length).toBe(5);
		});
	});

	describe('capacity (F-07)', () => {
		it('still schedules when a preceptor has a prior assignment in the year', async () => {
			const t = await makeTenant('a', { requiredDays: 5, maxStudents: 1 });
			// A different student already has one day with this preceptor earlier in the year.
			const s2 = nanoid();
			await db
				.insertInto('students')
				.values({ id: s2, name: 's2', email: `${s2}@x.com` })
				.execute();
			await db
				.insertInto('schedule_assignments')
				.values({
					id: nanoid(),
					schedule_id: t.scheduleId,
					student_id: s2,
					preceptor_id: t.preceptorId,
					clerkship_id: t.clerkshipId,
					site_id: t.siteId,
					date: '2026-02-02',
					status: 'scheduled'
				})
				.execute();
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-01'
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			// The target student is still fully scheduled — no false yearly cap.
			expect((await rows(t.scheduleId)).filter((a) => a.student_id === t.studentId).length).toBe(5);
			expect(body.data.success).toBe(true);
		});
	});

	describe('tenant isolation (F-02)', () => {
		it('a run for A does not touch B and never uses B assignments', async () => {
			const a = await makeTenant('a', { requiredDays: 5 });
			const b = await makeTenant('b', { requiredDays: 5 });
			const bFuture = await addAssignment(b, '2026-03-20');

			const res = await post(a.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-01'
			});
			expect(res.status).toBe(200);

			const bRows = await rows(b.scheduleId);
			// B's row is untouched and no generated rows were created for B.
			expect(bRows.length).toBe(1);
			expect(bRows[0].id).toBe(bFuture);
			expect(bRows.every((r) => r.source !== 'generated')).toBe(true);
			// A's rows never reference B's preceptor.
			const aRows = await rows(a.scheduleId);
			expect(aRows.length).toBeGreaterThan(0);
			expect(aRows.every((r) => r.preceptor_id === a.preceptorId)).toBe(true);
		});
	});

	describe('preview', () => {
		it('writes nothing and reports impact', async () => {
			const t = await makeTenant('a', { requiredDays: 5 });
			await addAssignment(t, '2026-03-02');
			const before = (await rows(t.scheduleId)).length;
			const res = await post(t.userId, {
				startDate: '2026-03-01',
				endDate: '2026-06-30',
				regenerateFromDate: '2026-03-16',
				preview: true
			});
			const body = await res.json();
			expect(res.status).toBe(200);
			expect(body.data.preview).toBe(true);
			expect((await rows(t.scheduleId)).length).toBe(before);
		});
	});

	describe('validation', () => {
		it('rejects an invalid date format (400)', async () => {
			const t = await makeTenant('a');
			const res = await post(t.userId, { startDate: 'nope', endDate: '2026-06-30' });
			expect(res.status).toBe(400);
		});

		it('rejects end before start (400)', async () => {
			const t = await makeTenant('a');
			const res = await post(t.userId, { startDate: '2026-06-30', endDate: '2026-03-01' });
			expect(res.status).toBe(400);
		});
	});
});
