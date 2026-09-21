// @coverage @req(R7.1) @req(R7.2)
/**
 * J3.4 — Hard blocks never pass (e2e plan Phase 3).
 *
 * A student double-book is a hard block: the day is refused in the picker (it
 * lists under blocked-days and the submit stays disabled) and, forced through
 * the API with the hard override code, the create is still rejected and nothing
 * is written. Runs in a populated sandbox.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const PRECEPTOR = 'Dr. Amanda Smith';
const PRECEPTOR2 = 'Dr. James Brown';
const CLERKSHIP = 'Family Medicine';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.4 manual scheduling — hard blocks', { tag: ['@stage1'] }, () => {
	test('a student double-book is blocked in the picker and rejected by the API', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J3.4 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;
		const day = futureWeekday(8);

		// Create a clean first assignment for the student on `day`.
		await asAdmin.goto(`/students/${studentId}`);
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickDay(day);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();

		// Attempt a second assignment for the SAME student on the SAME day with a
		// different preceptor → the picker marks the day blocked and submit is off.
		const dialog2 = new AssignmentDialog(asAdmin);
		await dialog2.open();
		await dialog2.selectClerkship(CLERKSHIP);
		await dialog2.selectPreceptor(PRECEPTOR2);
		await dialog2.pickDay(day);
		await dialog2.expectBlocked(/already|busy|booked/i);
		await dialog2.cancel();

		// Forcing it through the API with the hard code is still refused, and the
		// row count for the student does not change.
		const before = await api.get<unknown[]>(`/api/students/${studentId}/schedule`);
		const beforeCount = (before.data ?? []).length;
		const preceptor2Id = roster.preceptors.find((p) => p.name === PRECEPTOR2)!.id;
		const clerkshipId = roster.clerkships.find((c) => c.name === CLERKSHIP)!.id;
		const forced = await api.post('/api/schedules/assignments', {
			student_id: studentId,
			preceptor_id: preceptor2Id,
			clerkship_id: clerkshipId,
			date: day,
			override_codes: ['student_double_booked']
		});
		expect(forced.ok).toBe(false);
		expect(forced.status).toBeGreaterThanOrEqual(400);
		const after = await api.get<unknown[]>(`/api/students/${studentId}/schedule`);
		expect((after.data ?? []).length).toBe(beforeCount);
	});
});
