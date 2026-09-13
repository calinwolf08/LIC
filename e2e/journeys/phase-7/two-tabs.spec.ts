/**
 * J7.5 — Two tabs, one schedule (e2e plan Phase 7).
 *
 * The same coordinator with the schedule open in two tabs. The two tabs share
 * one session and one active schedule, so a write in one must be reflected — and
 * defended against — in the other:
 *
 *   - **Concurrent create / stale tab.** Tab 2 books a student on day D first;
 *     tab 1 (which still thinks the day is free) submits the same student/day and
 *     is hard-blocked (`student_double_booked`) with no duplicate row written.
 *     Tab 2 deletes its booking; tab 1's retry then succeeds.
 *   - **Generate in one tab, refresh in the other.** Tab 1 sits on the calendar
 *     while tab 2 runs a Full generation; after a refresh tab 1 shows the
 *     generated rows and a schedule-health pill consistent with the API.
 *
 * The two tabs are two pages on the same browser context (shared cookies), so
 * both act as the same admin against the same DB — exactly the real scenario.
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import { CalendarPage } from '../../pages/calendar-page';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('J7.5 two tabs, one schedule', { tag: ['@long', '@stage2'] }, () => {
	test('concurrent create is hard-blocked without a duplicate; generation is seen after refresh', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const gen = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(gen.sandbox);
		const student = gen.studentIds[0];

		// Tab 1 is the fixture page; tab 2 is a second page in the SAME context
		// (shared session → same active schedule).
		const tab1 = asAdmin;
		const tab2 = await asAdmin.context().newPage();
		const api1 = apiOf(tab1);
		const api2 = apiOf(tab2);

		const day = await freeWeekdayForStudents(kysely, [student], 8);
		const booking = {
			student_id: student,
			preceptor_id: gen.preceptorId,
			clerkship_id: gen.clerkshipId,
			site_id: gen.siteId,
			date: day
		};

		// --- Tab 2 books the day first ---
		const created = await api2.post<{ assignment: { id: string } }>(
			'/api/schedules/assignments',
			booking
		);
		expect(created.ok).toBe(true);
		const bookedId = created.data!.assignment.id;

		// --- Tab 1 (stale) submits the same student/day → hard block, no duplicate ---
		const clash = await api1.post('/api/schedules/assignments', booking);
		expect(clash.ok).toBe(false);
		expect(clash.status).toBe(422);
		expect(JSON.stringify(clash.error)).toMatch(/double|already has/i);
		// Exactly one row for (student, day) exists.
		expect(
			(await assignmentsForSchedule(kysely, gen.scheduleId)).filter(
				(r) => r.student_id === student && r.date === day
			)
		).toHaveLength(1);

		// --- Tab 2 deletes its booking; tab 1's retry now succeeds ---
		expect((await api2.delete(`/api/schedules/assignments/${bookedId}`)).ok).toBe(true);
		const retry = await api1.post('/api/schedules/assignments', booking);
		expect(retry.ok).toBe(true);

		// --- Tab 1 on the calendar; tab 2 runs Full generation; tab 1 refreshes ---
		const cal1 = new CalendarPage(tab1);
		await cal1.goto();
		expect(
			(
				await api2.post('/api/schedules/generate', {
					startDate: gen.sandbox.start,
					endDate: gen.sandbox.end,
					strategy: 'full-reoptimize'
				})
			).ok
		).toBe(true);
		const generatedInDb = (await assignmentsForSchedule(kysely, gen.scheduleId)).filter(
			(r) => r.source === 'generated'
		);
		expect(generatedInDb.length).toBeGreaterThan(0);

		// After a refresh, tab 1 sees the generated rows...
		await cal1.goto();
		await expect(cal1.grid.locator('[data-source="generated"]').first()).toBeVisible({
			timeout: 15000
		});

		// ...and its health pill agrees with the validation API (same session).
		const apiCounts = (
			await api1.get<{ counts: Record<string, number> }>('/api/schedules/validation')
		).data!.counts;
		const apiTotal = Object.values(apiCounts).reduce((a, b) => a + b, 0);
		await expect.poll(async () => cal1.health.violationCount(), { timeout: 15000 }).toBe(apiTotal);

		await tab2.close();
	});
});
