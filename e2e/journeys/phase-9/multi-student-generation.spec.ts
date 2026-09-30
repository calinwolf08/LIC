// @coverage @finding(CF-L1) @req(R7)
/**
 * Multi-student auto-generation — the validator and the engine under real load.
 *
 * These journeys imitate a coordinator generating a whole cohort at once and
 * assert BOTH sides of the contract:
 *  - when supply is enough, every student is completed with no violations and the
 *    whole-schedule validator reports a clean schedule (no false conflicts);
 *  - when the engine CANNOT fulfill the requirements (a preceptor's daily
 *    capacity is the bottleneck, or there simply aren't enough available days),
 *    it places only what is legitimately possible, never over-books a preceptor,
 *    and reports the shortfall as unmet requirements.
 *
 * Everything is driven through the real `/api/schedules/generate` endpoint and
 * checked against the generated rows and `GET /api/schedules/validation`.
 */

import { test, expect, apiOf, assignmentsForSchedule, fromToday } from '../../fixtures';
import { createSandboxSchedule, type Sandbox } from '../../fixtures/sandbox';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

/** `count` distinct future weekdays (Mon–Fri) starting at day offset `startAt`. */
function weekdays(count: number, startAt = 8): string[] {
	const out: string[] = [];
	let n = startAt;
	while (out.length < count) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(d);
		n++;
	}
	return out;
}

interface Setup {
	sb: Sandbox;
	scheduleId: string;
	clerkshipId: string;
	preceptorId: string;
	studentIds: string[];
	availableDays: string[];
	requiredDays: number;
}

/**
 * Stand up an active, workable single-clerkship/single-preceptor sandbox with N
 * onboarded students. `availabilityDays` weekdays get a materialised full-day
 * availability row; `maxStudents` is the preceptor's per-day cap.
 */
async function setup(
	page: Parameters<typeof apiOf>[0],
	kysely: Kysely<DB>,
	opts: {
		name: string;
		requiredDays: number;
		students: number;
		maxStudents: number;
		availabilityDays: number;
	}
): Promise<Setup> {
	const api = apiOf(page);
	// Space-free stamp: it seeds emails, which must be valid.
	const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
	const days = weekdays(Math.max(opts.availabilityDays, opts.requiredDays) + 4, 8);
	const rangeStart = days[0];
	const rangeEnd = days[days.length - 1];
	const availableDays = days.slice(0, opts.availabilityDays);

	const sb = await createSandboxSchedule(page, { name: opts.name, start: rangeStart, end: rangeEnd });
	const hsId = (await api.post<{ id: string }>('/api/health-systems', { name: `HS ${stamp}` })).data!.id;
	const siteId = (
		await api.post<{ id: string }>('/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
	).data!.id;
	const clerkshipId = (
		await api.post<{ id: string }>('/api/clerkships', {
			name: `Clerk ${stamp}`,
			required_days: opts.requiredDays,
			clerkship_type: 'outpatient'
		})
	).data!.id;
	const preceptorId = (
		await api.post<{ id: string }>('/api/preceptors', {
			name: `Dr ${stamp}`,
			email: `p_${stamp}@x.com`,
			max_students: opts.maxStudents,
			health_system_id: hsId,
			site_ids: [siteId]
		})
	).data!.id;

	const studentIds: string[] = [];
	for (let i = 0; i < opts.students; i++) {
		studentIds.push(
			(
				await api.post<{ id: string }>('/api/students', {
					name: `Stu ${i} ${stamp}`,
					email: `s${i}_${stamp}@x.com`
				})
			).data!.id
		);
	}

	const ts = new Date().toISOString();
	await kysely
		.insertInto('clerkship_sites')
		.values({ clerkship_id: clerkshipId, site_id: siteId, created_at: ts })
		.execute();
	await kysely
		.insertInto('student_health_system_onboarding')
		.values(
			studentIds.map((student_id) => ({
				id: crypto.randomUUID(),
				student_id,
				health_system_id: hsId,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			}))
		)
		.execute();
	await kysely
		.insertInto('preceptor_availability')
		.values(
			availableDays.map((date) => ({
				id: crypto.randomUUID(),
				preceptor_id: preceptorId,
				site_id: siteId,
				date,
				is_available: 1,
				session: 'full',
				credit_value: 1,
				created_at: ts,
				updated_at: ts
			}))
		)
		.execute();

	return {
		sb,
		scheduleId: sb.id,
		clerkshipId,
		preceptorId,
		studentIds,
		availableDays,
		requiredDays: opts.requiredDays
	};
}

interface GenResult {
	assignments: { student_id: string }[];
	unmetRequirements: { studentId: string; remainingDays: number; assignedDays: number }[];
	summary: { unmetRequirementsCount: number; totalViolations: number };
}

test.describe('multi-student auto-generation under load', { tag: ['@stage2', '@long'] }, () => {
	test('enough supply: every student is completed with no violations', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		// 3 students × 2 required days = 6 student-days; capacity 5/day over 4 days = 20
		// slots — comfortably enough.
		const s = await setup(asAdmin, kysely, {
			name: `Gen-ok ${Date.now()}`,
			requiredDays: 2,
			students: 3,
			maxStudents: 5,
			availabilityDays: 4
		});
		sandbox.register(s.sb);

		const gen = await api.post<GenResult>('/api/schedules/generate', {
			startDate: s.availableDays[0],
			endDate: s.availableDays[s.availableDays.length - 1],
			strategy: 'full-reoptimize'
		});
		expect(gen.ok).toBe(true);
		// Every student fully placed; nothing unmet.
		expect(gen.data!.summary.unmetRequirementsCount).toBe(0);

		const rows = await assignmentsForSchedule(kysely, s.scheduleId);
		for (const sid of s.studentIds) {
			expect(rows.filter((r) => r.student_id === sid)).toHaveLength(s.requiredDays);
		}
		// No student is placed twice on one day, and no day exceeds the preceptor cap.
		const perStudentDay = new Set<string>();
		for (const r of rows) {
			const k = `${r.student_id}:${r.date}`;
			expect(perStudentDay.has(k)).toBe(false);
			perStudentDay.add(k);
		}

		// The whole-schedule validator sees a clean cohort schedule — no false conflicts.
		const val = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
		expect(val.data!.counts.session_clash ?? 0).toBe(0);
		expect(val.data!.counts.preceptor_capacity ?? 0).toBe(0);
		expect(val.data!.counts.block_week_conflict ?? 0).toBe(0);
		expect(val.data!.counts.mutual_exclusion ?? 0).toBe(0);
	});

	test('capacity bottleneck: the engine never over-books and reports the shortfall', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		// 3 students each need 2 days, but the preceptor takes only 1 student/day and is
		// available on just 2 days → at most 2 student-days of capacity exist. Most of
		// the cohort cannot be completed.
		const s = await setup(asAdmin, kysely, {
			name: `Gen-cap ${Date.now()}`,
			requiredDays: 2,
			students: 3,
			maxStudents: 1,
			availabilityDays: 2
		});
		sandbox.register(s.sb);

		const gen = await api.post<GenResult>('/api/schedules/generate', {
			startDate: s.availableDays[0],
			endDate: s.availableDays[s.availableDays.length - 1],
			strategy: 'full-reoptimize'
		});
		expect(gen.ok).toBe(true);

		const rows = await assignmentsForSchedule(kysely, s.scheduleId);
		// Capacity respected: no (preceptor, date) holds more than 1 student.
		const perDayCount = new Map<string, number>();
		for (const r of rows) {
			const k = `${r.preceptor_id}:${r.date}`;
			perDayCount.set(k, (perDayCount.get(k) ?? 0) + 1);
		}
		for (const [, n] of perDayCount) expect(n).toBeLessThanOrEqual(1);
		// Only two student-days of capacity existed, so no more than two rows were placed.
		expect(rows.length).toBeLessThanOrEqual(2);

		// The shortfall is reported, not hidden.
		expect(gen.data!.summary.unmetRequirementsCount).toBeGreaterThan(0);

		// The validator does NOT invent a capacity conflict — the engine stayed within
		// the cap, so the generated schedule is under-filled but conflict-free.
		const val = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
		expect(val.data!.counts.preceptor_capacity ?? 0).toBe(0);
		expect(val.data!.counts.session_clash ?? 0).toBe(0);
	});

	test('not enough available days: each student is partially placed and flagged unmet', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		// Each student needs 3 days but the preceptor is only available on 2 days (with
		// plenty of daily capacity). Every student can reach at most 2 of 3.
		const s = await setup(asAdmin, kysely, {
			name: `Gen-avail ${Date.now()}`,
			requiredDays: 3,
			students: 2,
			maxStudents: 5,
			availabilityDays: 2
		});
		sandbox.register(s.sb);

		const gen = await api.post<GenResult>('/api/schedules/generate', {
			startDate: s.availableDays[0],
			endDate: s.availableDays[s.availableDays.length - 1],
			strategy: 'full-reoptimize'
		});
		expect(gen.ok).toBe(true);

		const rows = await assignmentsForSchedule(kysely, s.scheduleId);
		for (const sid of s.studentIds) {
			const mine = rows.filter((r) => r.student_id === sid);
			// Placed on the available days but never beyond them → at most 2 of the 3 needed.
			expect(mine.length).toBeLessThanOrEqual(2);
			expect(mine.every((r) => s.availableDays.includes(r.date))).toBe(true);
		}
		// Both students are reported short by at least one day.
		const unmetStudents = new Set(gen.data!.unmetRequirements.map((u) => u.studentId));
		for (const sid of s.studentIds) expect(unmetStudents.has(sid)).toBe(true);
		expect(gen.data!.unmetRequirements.every((u) => u.remainingDays >= 1)).toBe(true);

		// Still no invented conflicts on the partial schedule.
		const val = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
		expect(val.data!.counts.session_clash ?? 0).toBe(0);
		expect(val.data!.counts.preceptor_capacity ?? 0).toBe(0);
	});
});
