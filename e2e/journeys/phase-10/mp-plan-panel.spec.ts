// @coverage @scenario(MP-8) @req(R6.1) @req(R6.2) @req(R6.5)
/**
 * MP-8 — The planner's layout, driven the way a coordinator uses it.
 *
 *   - The add form and the requirements matrix sit side by side, so what's still
 *     needed is visible without scrolling: one row per student, one column per
 *     clerkship, each cell "saved (+ planned) / required" and coloured
 *     under / met with the plan / already met / over.
 *   - Clicking a cell fills in the student and clerkship.
 *   - Below, the plan opens as a calendar (chips name the student, clerkship and
 *     preceptor; the × drops a planned day), toggles to a list, and both views
 *     share the student / preceptor filters and the "Show saved" switch.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, type WorldSpec } from '../../worlds/world-builder';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const WEEKDAYS = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18];

function panelWorld(): WorldSpec {
	const weekdays = (site: string) =>
		WEEKDAYS.map((day) => ({ day, site, session: 'full' as const }));
	return {
		name: 'Planner panel',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 2, sites: ['Clinic'] },
			{ name: 'Internal Medicine', type: 'outpatient', requiredDays: 2, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. A',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: weekdays('Clinic')
			},
			{
				name: 'Dr. B',
				sites: ['Clinic'],
				teaches: ['Internal Medicine'],
				availability: weekdays('Clinic')
			}
		],
		students: [
			{ name: 'Student 1', onboardedAt: ['Metro'] },
			{ name: 'Student 2', onboardedAt: ['Metro'] }
		]
	};
}

test.describe('MP-8 planner layout and plan panel', { tag: ['@stage2'] }, () => {
	test('requirements beside the form; calendar and list views with filters, removal and saved days', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, panelWorld());
		sandbox.register(world.sandbox);
		const page = asAdmin;
		const plan = new PlanPage(page);
		const s1 = world.ids.student['Student 1'];
		const s2 = world.ids.student['Student 2'];
		const fm = world.ids.clerkship['Family Medicine'];
		const im = world.ids.clerkship['Internal Medicine'];
		const fmName = world.labels.clerkship['Family Medicine'];
		const imName = world.labels.clerkship['Internal Medicine'];

		await plan.goto();

		// --- What's needed is on screen next to the form, without scrolling ---
		const viewport = page.viewportSize()!;
		const matrix = await page.getByTestId('plan-progress').boundingBox();
		const form = await page.getByTestId('plan-form').boundingBox();
		expect(matrix!.y + matrix!.height).toBeLessThanOrEqual(viewport.height);
		expect(matrix!.x).toBeGreaterThan(form!.x + form!.width - 1); // beside, not below
		// One row per student, one column per clerkship.
		await expect(page.locator('[data-testid^="plan-progress-row-"]')).toHaveCount(2);
		await expect(page.getByTestId('plan-progress-col')).toHaveText([fmName, imName]);
		for (const [student, clerkship] of [
			[s1, fm],
			[s1, im],
			[s2, fm],
			[s2, im]
		]) {
			const cell = plan.requirementCell(student, clerkship);
			await expect(cell).toHaveText('0 / 2');
			await expect(cell).toHaveAttribute('data-status', 'under');
		}

		// --- Clicking a cell fills in the form; fill Student 1's Family Medicine ---
		await plan.requirementCell(s1, fm).click();
		await expect(page.getByTestId('plan-student')).toHaveValue(s1);
		await expect(page.getByTestId('plan-clerkship')).toHaveValue(fm);
		await plan.pick('plan-preceptor', 'Dr. A');
		await page.getByTestId('plan-fill-requirement').click();
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (2)');
		await expect(plan.requirementCell(s1, fm)).toHaveText('0 (+2) / 2');
		await expect(plan.requirementCell(s1, fm)).toHaveAttribute('data-status', 'met');

		// --- One day of Student 2's Internal Medicine: still under ---
		await plan.requirementCell(s2, im).click();
		await plan.pick('plan-preceptor', 'Dr. B');
		await plan.pickDays([world.anchor]);
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (3)');
		await expect(plan.requirementCell(s2, im)).toHaveText('0 (+1) / 2');
		await expect(plan.requirementCell(s2, im)).toHaveAttribute('data-status', 'under');

		// --- The plan opens as a calendar; chips name student, clerkship, preceptor ---
		await expect(page.getByTestId('plan-view-calendar')).toHaveAttribute('aria-pressed', 'true');
		const s2Chip = page.locator('[data-testid^="plan-cal-pin-"]', { hasText: 'Student 2' });
		await expect(s2Chip).toHaveCount(1);
		await expect(s2Chip.getByTestId('plan-cal-clerkship')).toHaveText(imName);
		await expect(s2Chip.getByTestId('plan-cal-preceptor')).toHaveText('Dr. B');

		// …and the × removes a planned day, updating the requirements too.
		const s2PinId = (await s2Chip.getAttribute('data-testid'))!.replace('plan-cal-pin-', '');
		await plan.removeFromCalendar(s2PinId);
		await expect(plan.planned()).toHaveText('Planned (2)');
		await expect(plan.requirementCell(s2, im)).toHaveText('0 / 2');

		// Plan Student 2's Internal Medicine in full.
		await plan.requirementCell(s2, im).click();
		await plan.pick('plan-preceptor', 'Dr. B');
		await page.getByTestId('plan-fill-requirement').click();
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (4)');

		// --- The calendar filters ---
		await plan.filterStudent('Student 2');
		await expect(
			page.locator('[data-testid^="plan-cal-pin-"]', { hasText: 'Student 1' })
		).toHaveCount(0);
		await plan.filterStudent('');

		// --- The List view, with the same filters ---
		await plan.showList();
		await expect(plan.rows()).toHaveCount(4);
		await plan.filterStudent('Student 2');
		await expect(plan.rows()).toHaveCount(2);
		await plan.filterPreceptor('Dr. A');
		await expect(plan.rows()).toHaveCount(0);
		await expect(page.getByTestId('plan-list-filtered-empty')).toBeVisible();
		await plan.filterStudent('');
		await expect(plan.rows()).toHaveCount(2); // Dr. A's two days with Student 1
		await plan.filterPreceptor('');
		await expect(plan.rows()).toHaveCount(4);

		// --- Commit: every requirement is now met by saved days ---
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 4 assignments/);
		await expect(plan.planned()).toHaveText('Planned (0)');
		for (const [student, clerkship] of [
			[s1, fm],
			[s2, im]
		]) {
			await expect(plan.requirementCell(student, clerkship)).toHaveText('2 / 2');
			await expect(plan.requirementCell(student, clerkship)).toHaveAttribute(
				'data-status',
				'met-saved'
			);
		}

		// --- "Show saved" shows or hides saved days in both views ---
		await expect(page.locator('[data-testid^="plan-saved-"]')).toHaveCount(4);
		await page.getByTestId('plan-show-saved').uncheck();
		await expect(page.locator('[data-testid^="plan-saved-"]')).toHaveCount(0);
		await plan.showCalendar();
		await expect(page.locator('[data-testid^="plan-cal-saved-"]')).toHaveCount(0);
		await page.getByTestId('plan-show-saved').check();
		await expect(page.locator('[data-testid^="plan-cal-saved-"]').first()).toBeVisible();
		// Saved days can't be removed from the planner.
		await expect(
			page.locator('[data-testid^="plan-cal-saved-"] [data-testid^="plan-cal-remove-"]')
		).toHaveCount(0);
	});
});
