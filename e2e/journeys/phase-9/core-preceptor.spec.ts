// @coverage @finding(CF-F5) @req(R7.4)
/**
 * CF-F5 — Core preceptors: assigning a student to a preceptor outside their core
 * set raises a soft, overrideable warning that is recorded on the assignment.
 *
 * Client feedback: "Assign preceptor to student as core preceptor(s). Restrict
 * assignments to their core preceptor or team." In Basic this is a bypassable
 * warning (not a hard block): the coordinator can proceed, and the accepted
 * override is persisted like every other soft code (R7.4).
 *
 * The journey sets the student's core preceptor to someone else via the real
 * API, then assigns a different preceptor through the real dialog and accepts the
 * override. That the assignment persists with `outside_core_preceptor` in its
 * override_codes proves the warning fired, was accepted, and was recorded — the
 * whole loop, end to end.
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule, parseCodes } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('CF-F5 core preceptor restriction (soft)', { tag: ['@stage1'] }, () => {
	test('assigning outside the core preceptor set warns, is accepted, and is recorded', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-F5 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const student = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		// Make the student's core preceptor SOMEONE ELSE, so assigning Dr. Amanda
		// Smith (a valid Family Medicine preceptor) is outside-core.
		const otherCore = roster.preceptors.find((p) => p.id !== amanda.id)!;
		const put = await api.put(`/api/students/${student.id}/core-preceptors`, {
			preceptor_ids: [otherCore.id]
		});
		expect(put.ok).toBe(true);

		const day = futureWeekday(8);
		await asAdmin.goto(`/students/${student.id}`);
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		await dialog.pickDay(day);
		// submitAndExpectCreated accepts every override conversation, including the
		// "Not a core preceptor" one; if that conversation never appeared, no
		// override code would be recorded and the assertion below would fail.
		await dialog.submitAndExpectCreated();

		const rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const row = rows.find((r) => r.date === day && r.preceptor_id === amanda.id);
		expect(row, 'the assignment was created').toBeTruthy();
		expect(parseCodes(row!.override_codes).includes('outside_core_preceptor')).toBe(true);
	});
});
