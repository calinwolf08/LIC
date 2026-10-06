// @coverage @finding(CF-M3) @req(R8)
/**
 * CF-M3 — Non-clinical exam days.
 *
 * An exam day, like a free day, holds the student's day with no
 * preceptor/clerkship/site and never counts toward clinical requirements. The
 * journey assigns an exam through the dialog's type selector, confirms it renders
 * distinctly on the student schedule, and confirms it doesn't move the student's
 * clinical requirement completion.
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

test.describe('CF-M3 non-clinical exam days', { tag: ['@stage1'] }, () => {
	test('assign an exam; it renders distinctly and does not change requirement completion', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-M3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `M3 Student ${stamp}`,
				email: `m3_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		const day = futureWeekday(9);

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`M3 Student ${stamp}`);
		await asAdmin.locator('#ad-kind').selectOption('exam');
		await dialog.pickDay(day);
		await dialog.submitAndExpectCreated();

		await asAdmin.goto(`/students/${sid}`);

		// The exam does not count toward any clerkship requirement: the student's
		// clerkship progress stays at 0% overall. (The requirement math excluding
		// non-clinical days is unit-proven in requirement-status.test.ts.)
		await expect(asAdmin.getByText('Clerkship progress (0% overall)')).toBeVisible({
			timeout: 15000
		});

		// Renders distinctly on the student schedule (Schedule tab, list view).
		await asAdmin.getByRole('tab', { name: 'Schedule' }).click();
		await asAdmin.getByRole('button', { name: 'List', exact: true }).click();
		const examRow = asAdmin.getByTestId(`student-assignment-exam-${day}`);
		await expect(examRow).toBeVisible({ timeout: 15000 });
		await expect(examRow).toContainText(/exam/i);
	});
});
