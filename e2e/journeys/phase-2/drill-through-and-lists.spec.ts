/**
 * J2.5 drill-through mesh + J2.6 list views (e2e plan Phase 2).
 *
 * Read-only journeys over the seeded Demo Schedule: every entity detail page has
 * a breadcrumb back to its list, entity names are links that resolve, and the
 * list views carry the status/availability/type indicators that make them
 * dashboards. No mutations, so this runs on the shared seed safely.
 *
 * FINDING P2-a: the student/preceptor/clerkship list pages have no search box,
 * so the plan's "search filters the list" is not assertable — recorded in
 * e2e-phase-2-findings.md rather than tested here.
 */

import { test, expect, apiOf } from '../../fixtures';
import { clickToNavigate } from './helpers';

const STUDENT = 'Alice Johnson';
const PRECEPTOR = 'Dr. Amanda Smith';
const CLERKSHIP = 'Family Medicine';

test.describe('J2.5 drill-through mesh', { tag: ['@stage1'] }, () => {
	test('every detail page has a breadcrumb back to its list', async ({ asAdmin }) => {
		test.setTimeout(120000);
		const api = apiOf(asAdmin);
		const crumb = (label: string) =>
			asAdmin.locator('nav[aria-label="Breadcrumb"]').getByRole('link', { name: label });

		// Resolve seeded entity ids from the caller's own session.
		const idOf = async <T extends { id: string; name?: string }>(
			path: string,
			match: string
		): Promise<string> => {
			const res = await api.get<T[]>(path);
			const row =
				(res.data ?? []).find((r) => (r as { name?: string }).name === match) ?? res.data?.[0];
			expect(row?.id, `${path} should have a row for ${match}`).toBeTruthy();
			return row!.id;
		};
		const studentId = await idOf('/api/students', STUDENT);
		const preceptorId = await idOf('/api/preceptors', PRECEPTOR);
		const clerkshipId = await idOf('/api/clerkships', CLERKSHIP);
		const siteId = await idOf('/api/sites', 'Metro General Hospital');

		// Each detail page renders a breadcrumb whose first crumb links back to the
		// list; clicking it returns there. Direct navigation isolates the
		// breadcrumb from list-page click races.
		for (const [url, label, backRe] of [
			[`/students/${studentId}`, 'Students', /\/students$/],
			[`/preceptors/${preceptorId}`, 'Preceptors', /\/preceptors$/],
			[`/clerkships/${clerkshipId}`, 'Clerkships', /\/clerkships$/],
			[`/sites/${siteId}`, 'Locations', /\/locations/]
		] as const) {
			await asAdmin.goto(url);
			await expect(crumb(label)).toBeVisible({ timeout: 15000 });
			await clickToNavigate(asAdmin, crumb(label), backRe);
		}
	});
});

test.describe('J2.6 list views as dashboards', { tag: ['@stage1'] }, () => {
	test('student list shows per-student status and completion', async ({ asAdmin }) => {
		await asAdmin.goto('/students');
		// A seeded student who is at least partially scheduled shows a non-empty
		// status pill; the fully-complete psychiatry student shows 100%.
		const rows = asAdmin.getByTestId('student-status');
		await expect(rows.first()).toBeVisible({ timeout: 15000 });
		const states = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
		// The seed has fully/partially/unscheduled students, so more than one state
		// is represented across the roster.
		expect(new Set(states).size).toBeGreaterThan(1);
	});

	test('preceptor list shows the availability-configured indicator', async ({ asAdmin }) => {
		await asAdmin.goto('/preceptors');
		const row = asAdmin.locator('tr', { hasText: PRECEPTOR });
		await expect(row).toBeVisible({ timeout: 15000 });
		// The seeded preceptors have materialised availability.
		await expect(row.getByTestId('availability-indicator')).toHaveAttribute(
			'data-configured',
			'true'
		);
	});

	test('clerkship list shows type and required-days columns; Manage opens the detail', async ({
		asAdmin
	}) => {
		await asAdmin.goto('/clerkships');
		const row = asAdmin.locator('tr', { hasText: CLERKSHIP });
		await expect(row).toBeVisible({ timeout: 15000 });
		await expect(row.getByText(/outpatient|inpatient/i)).toBeVisible();
		await row.getByRole('button', { name: 'Manage' }).click();
		await expect(asAdmin).toHaveURL(/\/clerkships\/[^/]+$/);
		await expect(asAdmin.getByRole('tab', { name: 'Overview' })).toBeVisible();
	});
});
