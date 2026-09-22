// @coverage @req(R3.3) @req(R3.4) @finding(P8-d)
/**
 * J2.7 — Editing a single availability date through the browser (e2e plan Phase 2).
 *
 * J2.2 proves a weekly pattern materialises into dates. This closes coverage doc
 * §4, gap #2: taking a *single* materialised date from available → unavailable
 * and back, entirely through the availability builder — not the whole pattern.
 *
 * The app models availability as layered patterns: a low-specificity weekly
 * pattern paints the base, and a high-specificity `individual` "Unavailable"
 * pattern overrides exactly one day. So the per-date edit is: add an individual
 * unavailable override for one in-range weekday and save (that one date flips to
 * is_available=0, its neighbours stay 1); the per-date delete is: remove that
 * override pattern and save (the date returns to available).
 *
 * Runs against a throwaway preceptor created in a sandbox so the shared seeded
 * preceptors' availability (relied on by the generation journeys) is untouched.
 * Saves settle asynchronously, so every checkpoint polls the availability API
 * rather than trusting the (lingering) toast.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

interface AvailabilityRow {
	date: string;
	is_available: number;
}

test.describe('J2.7 availability — single-date editing', { tag: ['@stage1'] }, () => {
	test('an individual override flips one materialised date to unavailable, then back', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J2.7 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		// A throwaway preceptor with one site, so its availability is ours to churn.
		const site = roster.sites[0];
		const stamp = Date.now();
		const created = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
			name: `Dr. Availability ${stamp}`,
			email: `avail_${stamp}@example.com`,
			health_system_id: site.health_system_id ?? undefined,
			site_ids: [site.id],
			max_students: 1
		});
		expect(created.ok).toBe(true);
		const precId = created.data?.preceptor?.id ?? created.data?.id;
		expect(precId).toBeTruthy();
		// The pattern-save endpoint is schedule-scoped, so the preceptor must belong
		// to the active sandbox.
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'preceptors',
			entityIds: [precId]
		});

		const availability = async (): Promise<AvailabilityRow[]> =>
			(await api.get<AvailabilityRow[]>(`/api/preceptors/${precId}/availability`)).data ?? [];
		const availabilityOn = async (date: string): Promise<number | undefined> =>
			(await availability()).find((r) => r.date === date)?.is_available;
		const saveDates = () =>
			asAdmin.getByRole('button', { name: /save availability|save \d+ availability/i }).click();

		// --- Paint a base weekly (Mon–Fri) availability over a two-week window ---
		await asAdmin.goto(`/preceptors/${precId}?tab=availability`);
		await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
		// Defaults: type Weekly, days Mon–Fri, Available. Just give it a range.
		await asAdmin.locator('#start-date').fill(fromToday(3));
		await asAdmin.locator('#end-date').fill(fromToday(17));
		await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();
		await saveDates();

		// Saves settle asynchronously — poll the API until the base has materialised.
		await expect
			.poll(async () => (await availability()).filter((r) => r.is_available === 1).length, {
				timeout: 15000
			})
			.toBeGreaterThanOrEqual(2);

		// Two of the base's weekdays: one we flip, one control that must not move.
		const availableDays = (await availability())
			.filter((r) => r.is_available === 1)
			.map((r) => r.date)
			.sort();
		const control = availableDays[0];
		const target = availableDays[1];

		// --- Edit ONE date: add an individual "Unavailable" override for `target` ---
		await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
		await asAdmin.getByRole('button', { name: 'Individual', exact: true }).click();
		await asAdmin.getByRole('button', { name: 'Unavailable', exact: true }).click();
		await asAdmin.locator('#start-date').fill(target);
		await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();
		// Confirm the override is queued (its pattern card is listed) before saving.
		// The individual card carries "Individual" but not "Weekly" (the outer
		// wrapper carries both, so exclude it).
		const overrideCard = asAdmin
			.locator('div.p-4')
			.filter({ hasText: 'Individual' })
			.filter({ hasNotText: 'Weekly' });
		await expect(overrideCard).toBeVisible({ timeout: 10000 });
		await saveDates();

		// Exactly that one date becomes unavailable; the control day is untouched.
		await expect.poll(() => availabilityOn(target), { timeout: 15000 }).toBe(0);
		expect(await availabilityOn(control)).toBe(1);

		// --- Delete that single-date override → `target` returns to available ---
		await overrideCard.getByRole('button', { name: 'Delete' }).click();
		await asAdmin.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
		await saveDates();

		await expect.poll(() => availabilityOn(target), { timeout: 15000 }).toBe(1);
		expect(await availabilityOn(control)).toBe(1);
	});
});
