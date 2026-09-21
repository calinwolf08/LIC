// @coverage @finding(CF-H1) @req(R3.2) @req(R3.3)
/**
 * CF-H1 — A weekly availability pattern whose weekdays never fall inside its
 * date range warns loudly instead of silently producing zero dates.
 *
 * Client feedback: "user selected W,T,F but a Sunday date so no dates were
 * added" — with no indication anything was wrong. The builder now shows a
 * visible "doesn't match any dates" warning as soon as the pattern yields none.
 *
 * Runs against a throwaway preceptor in a sandbox so the shared seeded
 * preceptors' availability (relied on by other journeys) is untouched.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

/** The next date (>= `from` days out) that lands on the given UTC weekday. */
function nextWeekday(from: number, dow: number): string {
	let n = from;
	while (new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay() !== dow) n++;
	return fromToday(n);
}

test.describe('CF-H1 empty availability pattern warns', { tag: ['@stage1'] }, () => {
	test('a Mon–Fri weekly pattern over a Sunday-only range warns, saves nothing', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `CF-H1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const site = roster.sites[0];
		const stamp = Date.now();
		const created = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
			name: `Dr. EmptyPattern ${stamp}`,
			email: `empty_${stamp}@example.com`,
			health_system_id: site.health_system_id ?? undefined,
			site_ids: [site.id],
			max_students: 1
		});
		expect(created.ok).toBe(true);
		const precId = created.data?.preceptor?.id ?? created.data?.id;
		expect(precId).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'preceptors',
			entityIds: [precId]
		});

		// Add a default Weekly (Mon–Fri) pattern whose range is a single Sunday.
		const sunday = nextWeekday(7, 0);
		await asAdmin.goto(`/preceptors/${precId}?tab=availability`);
		await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
		await asAdmin.locator('#start-date').fill(sunday);
		await asAdmin.locator('#end-date').fill(sunday);
		await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();

		// The warning is visible …
		await expect(asAdmin.getByTestId('pattern-no-dates-warning')).toBeVisible({ timeout: 10000 });

		// … and nothing was materialised for this preceptor.
		const rows =
			(await api.get<Array<{ date: string }>>(`/api/preceptors/${precId}/availability`)).data ?? [];
		expect(rows.length).toBe(0);
	});
});
