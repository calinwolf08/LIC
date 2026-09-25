// @coverage @finding(CF-E2) @req(R4.4)
/**
 * CF-E2 — Allowable missed days: a clerkship can define a minimum below its full
 * required days, and a student who reaches the minimum reads as complete (no false
 * "unscheduled"), while the strip still shows the full requirement as "X of Y
 * (min Z)".
 *
 * The journey creates a clerkship requiring 3 days with a minimum of 2, schedules
 * a student to the minimum, and asserts the student's requirement strip shows the
 * min annotation with zero days left.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

/** `count` distinct future weekdays (Mon–Fri), starting at day offset `startAt`. */
function futureWeekdays(count: number, startAt: number): string[] {
	const out: string[] = [];
	let n = startAt;
	while (out.length < count) {
		const date = fromToday(n);
		const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(date);
		n++;
	}
	return out;
}

test.describe('CF-E2 allowable missed days (min required)', { tag: ['@stage1'] }, () => {
	test('reaching the minimum reads as complete with a "min" annotation', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-E2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const site = roster.sites[0];
		const stamp = Date.now();

		// A clerkship requiring 3 days but complete at a minimum of 2.
		const clerkshipName = `MinClerk ${stamp}`;
		const created = await api.post<{ id?: string; clerkship?: { id: string } }>('/api/clerkships', {
			name: clerkshipName,
			clerkship_type: 'outpatient',
			required_days: 3,
			min_required_days: 2
		});
		expect(created.ok).toBe(true);
		const clerkshipId = created.data?.clerkship?.id ?? created.data?.id;
		expect(clerkshipId).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'clerkships',
			entityIds: [clerkshipId]
		});

		// Schedule Alice to the minimum (2 of 3 days).
		const [d1, d2] = futureWeekdays(2, 8);
		for (const date of [d1, d2]) {
			const r = await api.post('/api/schedules/assignments', {
				student_id: alice.id,
				preceptor_id: amanda.id,
				clerkship_id: clerkshipId,
				site_id: site.id,
				date,
				force: true
			});
			expect(r.ok).toBe(true);
		}

		// The student's strip shows the clerkship as complete: min annotation, 0 left.
		await asAdmin.goto(`/students/${alice.id}`);
		const row = asAdmin
			.locator('div.rounded-lg.border')
			.filter({ hasText: clerkshipName });
		await expect(row).toBeVisible({ timeout: 15000 });
		await expect(row).toContainText(/\(min 2\)/);
		await expect(row).toContainText(/0 left \/ 3/);
		// Complete → no "Add days" prompt in this row.
		await expect(row.getByRole('button', { name: /add days/i })).toHaveCount(0);
	});
});
