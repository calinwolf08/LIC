// @coverage @finding(CF-H8) @req(R3.2)
/**
 * CF-H8 — Availability preference levels (preferred / in-a-pinch).
 *
 * Client feedback: "Preceptor available need to model 'in a pinch' or
 * 'preferred'." In Basic the coordinator tags available days with a preference,
 * sees it on the pattern, and it persists onto the materialised availability
 * rows. How that tag is then *consumed* — the manual warning and the auto-gen
 * weighting — is covered by availability-preference-consumption.spec.ts.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

interface AvailabilityRow {
	date: string;
	is_available: number;
	preference: string | null;
}

test.describe('CF-H8 availability preference levels', { tag: ['@stage1'] }, () => {
	test('a preferred weekly pattern shows the pill and persists the preference', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `CF-H8 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const site = roster.sites[0];
		const stamp = Date.now();
		const created = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
			name: `Dr. Preference ${stamp}`,
			email: `pref_${stamp}@example.com`,
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

		// Add a default Weekly (Mon–Fri) available pattern tagged "Preferred".
		await asAdmin.goto(`/preceptors/${precId}?tab=availability`);
		await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
		await asAdmin.locator('#preference-select').selectOption('preferred');
		await asAdmin.locator('#start-date').fill(fromToday(3));
		await asAdmin.locator('#end-date').fill(fromToday(17));
		await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();

		// The pattern list shows the Preferred pill.
		await expect(asAdmin.getByText('Preferred').first()).toBeVisible({ timeout: 10000 });

		// Save, then the materialised availability rows carry the preference.
		await asAdmin.getByRole('button', { name: /save availability|save \d+ availability/i }).click();
		await expect
			.poll(
				async () => {
					const rows =
						(await api.get<AvailabilityRow[]>(`/api/preceptors/${precId}/availability`)).data ?? [];
					return rows.filter((r) => r.is_available === 1 && r.preference === 'preferred').length;
				},
				{ timeout: 15000 }
			)
			.toBeGreaterThanOrEqual(1);
	});
});
