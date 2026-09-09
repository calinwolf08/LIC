/**
 * J3.2 — Range creation places many clean days at once (e2e plan Phase 3).
 *
 * The dialog's range mode selects an inclusive span of days; a clean weekday
 * range for a known-good student/preceptor creates one assignment per selected
 * day, and every surface (picker selection, the "N day(s) assigned" toast, the
 * DB) agrees on the count. Runs in a populated sandbox on Alice Johnson.
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const PRECEPTOR = 'Dr. Amanda Smith';
const CLERKSHIP = 'Family Medicine';

/** The first Monday at least `atLeast` days out, as YYYY-MM-DD. */
function futureMonday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		if (new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay() === 1) return fromToday(n);
		n++;
	}
}

/** `days` days after a YYYY-MM-DD date, as YYYY-MM-DD. */
function plusDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

test.describe('J3.2 manual scheduling — range creation', { tag: ['@stage1'] }, () => {
	test('a clean Mon–Fri range creates one assignment per weekday', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;

		// Pick a Mon–Fri week (>= 8 days out) whose five weekdays contain none of
		// the seeded blackout dates, so the whole range is clean.
		const api = apiOf(asAdmin);
		const blackouts = new Set(
			((await api.get<Array<{ date: string }>>('/api/blackout-dates')).data ?? []).map(
				(b) => b.date
			)
		);
		// The range must also stay inside one calendar month — the picker shows one
		// month at a time, so a Mon–Fri that straddles a month boundary would not
		// all be visible (and `selectedDates()` reads only the visible month).
		let monday = futureMonday(8);
		for (let guard = 0; guard < 12; guard++) {
			const week = [0, 1, 2, 3, 4].map((i) => plusDays(monday, i));
			const sameMonth = week.every((d) => d.slice(0, 7) === week[0].slice(0, 7));
			if (sameMonth && !week.some((d) => blackouts.has(d))) break;
			monday = plusDays(monday, 7);
		}
		const friday = plusDays(monday, 4);
		const expectedDays = [0, 1, 2, 3, 4].map((i) => plusDays(monday, i));
		expect(
			expectedDays.some((d) => blackouts.has(d)),
			'chosen week is blackout-free'
		).toBe(false);

		await asAdmin.goto(`/students/${studentId}`);
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickRange(monday, friday);

		// The picker selected exactly the five weekdays, and the span is clean.
		const selected = await dialog.selectedDates();
		expect(selected).toEqual(expectedDays);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();
		// The confirmation reports five days.
		await expect(asAdmin.getByText(/5 day\(s\) assigned/i).last()).toBeVisible({ timeout: 15000 });

		// DB: exactly the five weekday rows, all for this student.
		const rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const dates = rows
			.filter((r) => r.student_id === studentId)
			.map((r) => r.date)
			.sort();
		expect(dates).toEqual(expectedDays);
	});
});
