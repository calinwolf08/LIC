// @coverage @req(R7.1) @req(R7.2) @req(R7.3) @req(R7.4)
/**
 * J4.4 — Schedule health is one number everywhere (e2e plan Phase 4).
 *
 * The whole-schedule validation total must be identical on every surface that
 * shows it — GET /api/schedules/validation, the calendar health pill, the
 * calendar health panel's per-type breakdown, and the dashboard "Schedule
 * health" card — and must move together when a finding is fixed.
 *
 * The assertion is on a blackout the test controls: place a clean assignment,
 * read the baseline on every surface, add a blackout on that day (an unresolved
 * blackout_date finding), assert every surface reports the same risen total,
 * then remove the blackout and assert every surface returns to baseline. It
 * asserts cross-surface equality and return-to-baseline rather than an exact
 * delta, since the seeded day can carry a second finding — and is robust to
 * whatever baseline the seeded roster's availability produces.
 *
 * Blackouts are schedule-scoped (finding P4-d); the one added here lives on the
 * sandbox and is cleaned up.
 */

import { test, expect, apiOf, type Page } from '../../fixtures';
import { CalendarPage } from '../../pages/calendar-page';
import { populatedSandbox, createAssignment, freeWeekdayForStudents } from './helpers';

const SAFETY = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];

interface Validation {
	violations: unknown[];
	counts: Record<string, number>;
}

async function validationTotal(
	page: Page
): Promise<{ total: number; counts: Record<string, number> }> {
	const res = await apiOf(page).get<Validation>('/api/schedules/validation');
	if (!res.ok || !res.data) throw new Error(`validation fetch failed (${res.status})`);
	return { total: res.data.violations.length, counts: res.data.counts ?? {} };
}

/** The dashboard "Schedule health" card's number (data-violation-count). */
async function dashboardCount(page: Page): Promise<number> {
	await page.goto('/dashboard');
	const card = page.getByTestId('dash-health');
	await expect(card).toBeVisible({ timeout: 15000 });
	return Number((await card.getAttribute('data-violation-count')) ?? -1);
}

test.describe('J4.4 schedule health is one number', { tag: ['@stage1'] }, () => {
	test('the total agrees across API, calendar, panel and dashboard and moves together', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J4.4 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const bob = roster.students.find((s) => s.name === 'Bob Williams')!.id;
		const michael = roster.preceptors.find((p) => p.name === 'Dr. Michael Lee')!.id;
		const peds = roster.clerkships.find((c) => c.name === 'Pediatrics')!.id;
		const community = roster.sites.find((s) => s.name === 'Community Hospital')!.id;

		const day = await freeWeekdayForStudents(db, [bob], 8);
		await createAssignment(asAdmin, {
			student_id: bob,
			preceptor_id: michael,
			clerkship_id: peds,
			site_id: community,
			date: day,
			override_codes: SAFETY
		});

		// --- Baseline: every surface agrees ---
		const base = await validationTotal(asAdmin);
		const baseBlackouts = base.counts['blackout_date'] ?? 0;

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		expect(await cal.health.violationCount()).toBe(base.total);
		expect(await dashboardCount(asAdmin)).toBe(base.total);

		// --- Add a blackout on the assignment's day → one new blackout_date finding ---
		const created = await api.post<{ id: string }>('/api/blackout-dates', {
			date: day,
			reason: 'Health test blackout'
		});
		expect(created.ok).toBe(true);
		const blackoutId = created.data!.id;

		try {
			// The blackout adds at least one unresolved blackout_date finding; the
			// exact rise depends on the seeded day, so assert it moved up and that
			// every surface reports the *same* risen total (the "one number" claim).
			const withBlackout = await validationTotal(asAdmin);
			expect(withBlackout.total).toBeGreaterThan(base.total);
			expect(withBlackout.counts['blackout_date'] ?? 0).toBeGreaterThan(baseBlackouts);
			const risen = withBlackout.total;

			// Calendar pill + per-type panel agree with the API.
			await cal.goto();
			expect(await cal.health.violationCount()).toBe(risen);
			const byType = await cal.health.countsByCode();
			expect(byType['blackout_date'] ?? 0).toBe(withBlackout.counts['blackout_date']);

			// Dashboard card agrees.
			expect(await dashboardCount(asAdmin)).toBe(risen);
		} finally {
			// --- Fix it (remove the blackout) → every surface falls back together ---
			await api.delete(`/api/blackout-dates/${blackoutId}`);
		}

		const fixed = await validationTotal(asAdmin);
		expect(fixed.total).toBe(base.total);
		expect(fixed.counts['blackout_date'] ?? 0).toBe(baseBlackouts);

		await cal.goto();
		expect(await cal.health.violationCount()).toBe(base.total);
		expect(await dashboardCount(asAdmin)).toBe(base.total);
	});
});
