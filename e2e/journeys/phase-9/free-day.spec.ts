// @coverage @finding(CF-M2) @req(R8)
/**
 * CF-M2 — Non-clinical free days.
 *
 * A free day occupies the student's day but has no preceptor/clerkship/site and
 * never counts toward clinical requirements. The journey assigns a free day
 * through the dialog's type selector, confirms it appears on the student schedule
 * as a non-clinical day, and confirms a second assignment on that same day is
 * flagged as an overlapping session (the free day still holds the day).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog, CalendarPage } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return d;
		n++;
	}
}

test.describe('CF-M2 non-clinical free days', { tag: ['@stage1'] }, () => {
	test('assign a free day; it shows on the schedule and holds the day', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-M2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `M2 Student ${stamp}`,
				email: `m2_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		const day = futureWeekday(9);

		// --- Assign a free day through the dialog (no preceptor/clerkship/site) -----
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`M2 Student ${stamp}`);
		await asAdmin.locator('#ad-kind').selectOption('free_day');
		// The clinical pickers are hidden for a non-clinical day.
		await expect(asAdmin.locator('#ad-clerkship')).toHaveCount(0);
		await expect(asAdmin.locator('#ad-preceptor')).toHaveCount(0);
		await dialog.pickDay(day);
		await dialog.submitAndExpectCreated();

		// --- It appears on the student schedule as a non-clinical day --------------
		await asAdmin.goto(`/students/${sid}`);
		await asAdmin.getByRole('tab', { name: 'Schedule' }).click();
		await asAdmin.getByRole('button', { name: 'List', exact: true }).click();
		await expect(asAdmin.getByTestId(`student-assignment-free_day-${day}`)).toBeVisible({
			timeout: 15000
		});

		// --- A clinical assignment the same day overlaps the free day's session ----
		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const dry = await api.post<{ soft?: { code: string }[] }>('/api/schedules/assignments', {
			student_id: sid,
			preceptor_id: amanda.id,
			clerkship_id: roster.clerkships.find((c) => c.name === 'Family Medicine')!.id,
			site_id: roster.sites[0].id,
			date: day,
			dry_run: true
		});
		expect((dry.data?.soft ?? []).some((v) => v.code === 'session_clash')).toBe(true);
	});
});
