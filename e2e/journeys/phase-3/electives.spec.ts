// @coverage @req(R2.1) @req(R4.2) @req(R4.3)
/**
 * J3.7 — Electives are tracked per elective (e2e plan Phase 3).
 *
 * Internal Medicine seeds two electives — Cardiology (min 3 days, required) and
 * Dermatology (min 2 days, optional). The dialog offers both, its requirement
 * strip counts against the *elective's* own minimum (not the clerkship's 28),
 * and days assigned to one elective do not count toward the other. Each created
 * row carries its own `elective_id`. Runs in a populated sandbox on Alice
 * Johnson, who is onboarded everywhere so the creates are clean.
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const CLERKSHIP = 'Internal Medicine';
const PRECEPTOR = 'Dr. Maria Garcia'; // IM team, teaches both seeded electives at Metro General

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.7 manual scheduling — electives', { tag: ['@stage1'] }, () => {
	test('per-elective requirement tracking: Cardiology and Dermatology count separately', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.7 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;
		const d1 = futureWeekday(8);
		const d2 = futureWeekday(9);

		const scheduleRows = async () => {
			const res = await api.get<{
				assignments: Array<{ date: string; electiveName?: string | null }>;
			}>(`/api/students/${studentId}/schedule`);
			return res.data?.assignments ?? [];
		};

		// --- Create a Cardiology day ---
		await asAdmin.goto(`/students/${studentId}`);
		let dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);

		// The elective picker offers both seeded electives, annotated with minimums.
		const opts = (await dialog.optionLabels('elective')).join(' | ');
		expect(opts).toMatch(/Cardiology/i);
		expect(opts).toMatch(/Dermatology/i);

		await dialog.selectElective('Cardiology');
		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickDay(d1);
		// The strip counts against Cardiology's own minimum (3), not IM's 28 days.
		await expect(dialog.requirementStrip()).toContainText(/Cardiology/i);
		await expect(dialog.requirementStrip()).toContainText(/of 3\b/i);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();

		// DB: the row carries a Cardiology elective_id.
		let rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const cardioRow = rows.find((r) => r.date === d1);
		expect(cardioRow?.elective_id, 'Cardiology day records its elective_id').toBeTruthy();
		const cardioElectiveId = cardioRow!.elective_id;
		// API view names the elective.
		let sched = await scheduleRows();
		expect(sched.find((a) => a.date === d1)?.electiveName).toBe('Cardiology');

		// --- A fresh dialog now shows Cardiology decremented, Dermatology untouched ---
		dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectElective('Cardiology');
		// One of three Cardiology days is now scheduled → two still needed.
		await expect(dialog.requirementStrip()).toContainText(/2 of 3\b/i);
		// Switching to Dermatology: its own minimum, unaffected by the Cardiology day.
		await dialog.selectElective('Dermatology');
		await expect(dialog.requirementStrip()).toContainText(/Dermatology/i);
		await expect(dialog.requirementStrip()).toContainText(/2 of 2\b/i);

		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickDay(d2);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();

		// DB: two rows, each with its own (distinct) elective_id.
		rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const dermRow = rows.find((r) => r.date === d2);
		expect(dermRow?.elective_id, 'Dermatology day records its elective_id').toBeTruthy();
		expect(dermRow!.elective_id).not.toBe(cardioElectiveId);

		// API view: both electives present and named distinctly.
		sched = await scheduleRows();
		expect(sched.find((a) => a.date === d2)?.electiveName).toBe('Dermatology');
		const names = sched
			.map((a) => a.electiveName)
			.filter(Boolean)
			.sort();
		expect(names).toEqual(['Cardiology', 'Dermatology']);
	});
});
