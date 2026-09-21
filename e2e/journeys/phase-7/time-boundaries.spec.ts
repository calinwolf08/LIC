// @coverage @finding(F-22)
/**
 * J7.3 — Time boundaries (e2e plan Phase 7).
 *
 * A schedule that straddles "today" — spanning last month through next month —
 * must treat past and future days correctly and consistently:
 *   - past assignments are credited toward requirements (a student whose only
 *     days are in the past still counts as complete);
 *   - creating on a past day surfaces the `past_date` soft code;
 *   - a Smart (minimal-change) regenerate from today leaves past rows untouched;
 *   - a Full regenerate also preserves past rows (locked or not) — nothing before
 *     the cutoff is ever deleted;
 *   - moving a future row back into the past trips `past_date`, and only an
 *     explicit override lets it through;
 *   - the calendar marks today correctly even with the month grid spanning the
 *     boundary.
 *
 * Built on a throwaway sandbox whose range is monthStart(-1) → monthEnd(+1) so
 * "today" sits in the middle.
 */

import {
	test,
	expect,
	apiOf,
	fromToday,
	monthStart,
	monthEnd,
	assignmentRow,
	type Page
} from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import { weekdaysBetween } from '../phase-5/helpers';
import { createAssignment, futureWeekday } from '../phase-4/helpers';
import { CalendarPage } from '../../pages/calendar-page';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

async function post<T = { id: string }>(page: Page, path: string, body: unknown): Promise<T> {
	const res = await apiOf(page).post<T>(path, body);
	if (!res.ok || !res.data) throw new Error(`POST ${path} failed (${res.status})`);
	return res.data;
}

/** A weekday at least `atLeast` days in the PAST, as YYYY-MM-DD (skips Sat/Sun). */
function pastWeekday(atLeast: number, exclude: string[] = []): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(-n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6 && !exclude.includes(d)) return d;
		n++;
	}
}

function generate(page: Page, start: string, end: string, strategy: string) {
	return apiOf(page).post('/api/schedules/generate', { startDate: start, endDate: end, strategy });
}

test.describe('J7.3 time boundaries', { tag: ['@long', '@stage2'] }, () => {
	test('past is credited and preserved; past_date warns; today marker is correct', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		// A schedule straddling today.
		const start = monthStart(-1);
		const end = monthEnd(1);
		const s = await createSandboxSchedule(asAdmin, { name: `Time ${stamp}`, start, end });
		sandbox.register(s);

		// --- Minimal workable world (required_days = 2) ---
		const hsId = (await post(asAdmin, '/api/health-systems', { name: `HS ${stamp}` })).id;
		const siteId = (
			await post(asAdmin, '/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
		).id;
		const clerkshipId = (
			await post(asAdmin, '/api/clerkships', {
				name: `Clerkship ${stamp}`,
				required_days: 2,
				clerkship_type: 'outpatient'
			})
		).id;
		const preceptorId = (
			await post(asAdmin, '/api/preceptors', {
				name: `Dr Time ${stamp}`,
				email: `time_${stamp}@example.com`,
				max_students: 5,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).id;
		const studentId = (
			await post(asAdmin, '/api/students', {
				name: `Student Time ${stamp}`,
				email: `time_stu_${stamp}@example.com`
			})
		).id;

		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_sites')
			.values({ clerkship_id: clerkshipId, site_id: siteId, created_at: ts })
			.execute();
		await kysely
			.insertInto('student_health_system_onboarding')
			.values({
				id: crypto.randomUUID(),
				student_id: studentId,
				health_system_id: hsId,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// Materialise availability across every weekday in range (past + future).
		await kysely
			.insertInto('preceptor_availability')
			.values(
				weekdaysBetween(start, end).map((date) => ({
					id: crypto.randomUUID(),
					preceptor_id: preceptorId,
					site_id: siteId,
					date,
					is_available: 1,
					created_at: ts,
					updated_at: ts
				}))
			)
			.execute();

		// --- Seed two PAST assignments (the student's only days are behind us) ---
		const past1 = pastWeekday(4);
		const past2 = pastWeekday(4, [past1]);
		const mkPast = (date: string) =>
			createAssignment(asAdmin, {
				student_id: studentId,
				preceptor_id: preceptorId,
				clerkship_id: clerkshipId,
				site_id: siteId,
				date,
				override_codes: ['past_date']
			});
		const pastId1 = await mkPast(past1);
		const pastId2 = await mkPast(past2);

		// --- Past days are credited: the student's 2 required days are complete ---
		{
			const summary = (
				await api.get<{ isComplete: boolean; studentsWithUnmetRequirements: unknown[] }>(
					'/api/schedule/summary'
				)
			).data!;
			expect(summary.isComplete).toBe(true);
			expect(summary.studentsWithUnmetRequirements).toHaveLength(0);
		}

		// --- Creating on a past day surfaces past_date (dry run) ---
		{
			const dry = await api.post<{ soft: Array<{ code: string }> }>('/api/schedules/assignments', {
				student_id: studentId,
				preceptor_id: preceptorId,
				clerkship_id: clerkshipId,
				site_id: siteId,
				date: pastWeekday(4, [past1, past2]),
				dry_run: true
			});
			expect(dry.ok).toBe(true);
			expect(dry.data!.soft.some((v) => v.code === 'past_date')).toBe(true);
		}

		// --- Smart (minimal-change) from today leaves the past rows in place ---
		expect((await generate(asAdmin, start, end, 'minimal-change')).ok).toBe(true);
		expect(await assignmentRow(kysely, pastId1)).toBeTruthy();
		expect(await assignmentRow(kysely, pastId2)).toBeTruthy();

		// --- A Full regenerate also preserves past rows (locked or not) ---
		expect((await api.patch(`/api/schedules/assignments/${pastId1}`, { locked: true })).ok).toBe(
			true
		);
		expect((await generate(asAdmin, start, end, 'full-reoptimize')).ok).toBe(true);
		expect((await assignmentRow(kysely, pastId1))!.locked).toBe(1); // locked past row survived
		expect(await assignmentRow(kysely, pastId2)).toBeTruthy(); // unlocked past row survived too

		// --- Moving a future row back into the past trips past_date ---
		// A fresh future override day (the student's requirement is already met, so
		// this extra day carries over_required_days by design).
		const futureId = await createAssignment(asAdmin, {
			student_id: studentId,
			preceptor_id: preceptorId,
			clerkship_id: clerkshipId,
			site_id: siteId,
			date: futureWeekday(6),
			override_codes: ['over_required_days']
		});
		const pastTarget = pastWeekday(4, [past1, past2]);
		{
			// Without accepting past_date the edit is refused (422), naming the date.
			const blocked = await api.patch(`/api/schedules/assignments/${futureId}`, {
				date: pastTarget
			});
			expect(blocked.ok).toBe(false);
			expect(blocked.status).toBe(422);
			expect(JSON.stringify(blocked.error)).toMatch(/past/i);
			// Accepting past_date (and the standing over_required_days) lets it through.
			const ok = await api.patch(`/api/schedules/assignments/${futureId}`, {
				date: pastTarget,
				override_codes: ['past_date', 'over_required_days']
			});
			expect(ok.ok).toBe(true);
			expect((await assignmentRow(kysely, futureId))!.date).toBe(pastTarget);
		}

		// --- Calendar marks today correctly, with the grid spanning the boundary ---
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const todayStr = fromToday(0);
		const todayCell = cal.grid.locator(`[data-date="${todayStr}"]`).first();
		await expect(todayCell).toBeVisible({ timeout: 15000 });
		expect(await todayCell.getAttribute('class')).toMatch(/ring-primary/);
	});
});
