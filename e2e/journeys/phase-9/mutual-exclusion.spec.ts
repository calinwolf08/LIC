// @coverage @constraint(mutual_exclusion)
// @coverage @finding(CF-L2) @req(R7)
/**
 * CF-L2 — Preceptor mutual exclusion.
 *
 * Two preceptors can be marked "must not share a student-day". The journey uses the
 * rule editor on the preceptor page to set the rule, then assigns a student to both
 * preceptors on the same day: the assignment dialog warns (overridable), the
 * coordinator overrides, and the student's conflict panel lists the mutual-exclusion
 * conflict. The warning is a Basic feature; auto-avoidance is the gated tier.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog, CalendarPage } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

const SAFETY = [
	'session_clash',
	'mutual_exclusion',
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule'
];

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return d;
		n++;
	}
}

test.describe('CF-L2 preceptor mutual exclusion', { tag: ['@stage1'] }, () => {
	test('rule editor sets a pair; assigning both on one day warns and shows a conflict', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-L2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const james = roster.preceptors.find((p) => p.name === 'Dr. James Brown')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const site = roster.sites.find((s) => s.name === 'Metro General Hospital')!;

		// Dedicated student so the conflict panel reflects only this journey.
		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `L2 Student ${stamp}`,
				email: `l2_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		// --- Rule editor: mark Amanda & James mutually exclusive ---------------
		await asAdmin.goto(`/preceptors/${amanda.id}?tab=details`);
		const panel = asAdmin.getByTestId('mutual-exclusions');
		await expect(panel).toBeVisible({ timeout: 15000 });
		await panel.getByTestId(`exclude-${james.id}`).check();
		await panel.getByTestId('save-exclusions').click();
		// Persisted symmetrically: James's set now contains Amanda.
		await expect
			.poll(async () => {
				const r = await api.get<{ preceptor_ids: string[] }>(
					`/api/preceptors/${james.id}/mutual-exclusions`
				);
				return r.data?.preceptor_ids ?? [];
			})
			.toContain(amanda.id);

		// --- First assignment: student + Amanda on d1 --------------------------
		const d1 = futureWeekday(10);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: amanda.id,
					clerkship_id: fm.id,
					site_id: site.id,
					date: d1,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Second assignment via the dialog: James on the SAME day → warns ---
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`L2 Student ${stamp}`);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. James Brown');
		// Pick whichever site James serves (not necessarily Metro).
		const siteSelect = asAdmin.locator('#ad-site');
		await expect(siteSelect).toBeVisible();
		const options = siteSelect.locator('option');
		const optionCount = await options.count();
		let picked = false;
		for (let i = 0; i < optionCount; i++) {
			const value = await options.nth(i).getAttribute('value');
			if (value && !(await options.nth(i).isDisabled())) {
				await siteSelect.selectOption(value);
				picked = true;
				break;
			}
		}
		expect(picked, 'James Brown should serve at least one site for Family Medicine').toBe(true);
		await dialog.pickDay(d1);
		await expect(dialog.overrideSummary()).toContainText(/not to share a day/i);
		await dialog.submitAndExpectCreated();

		// --- Negative: the rule is per-DAY, not global. Put the same excluded
		// preceptor (James) on a DIFFERENT, otherwise-empty day. Amanda is not there,
		// so the pair does not share that day and it must NOT be a mutual-exclusion
		// conflict — the rule is applied only where it actually bites. ---------------
		const d2 = futureWeekday(17);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: james.id,
					clerkship_id: fm.id,
					site_id: site.id,
					date: d2,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Conflict panel: d1 (shared day) is a mutual-exclusion conflict; d2
		// (James alone) is not. ------------------------------------------------------
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('student-conflicts')).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-mutual_exclusion-${d1}`)).toBeVisible();
		await expect(asAdmin.getByTestId(`student-conflict-mutual_exclusion-${d2}`)).toHaveCount(0);
	});
});
