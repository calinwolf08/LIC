// @coverage @scenario(MP-10) @req(R6.1) @req(R6.2)
/**
 * MP-10 — Half-day preceptors in the planner. Session defaults to "All sessions",
 * so a preceptor who only works mornings or afternoons is offered with their open
 * days, and each day is added as whichever session fits it:
 *
 *   - the date picker labels every open day AM, PM or Full;
 *   - the picked days show their session mix ("1 AM · 1 PM"), and are added with
 *     half a day's credit each;
 *   - "Pick the next N open days" counts half days as half;
 *   - the Session menu still narrows to one session ("Full day only" hides a
 *     preceptor who has no full days).
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays, type WorldSpec } from '../../worlds/world-builder';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function sessionsWorld(): WorldSpec {
	return {
		name: 'Planner sessions',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [{ name: 'Psychiatry', type: 'outpatient', requiredDays: 2, sites: ['Clinic'] }],
		preceptors: [
			// Tuesday and Thursday mornings, Friday afternoons, for two weeks.
			{
				name: 'Dr. Half',
				sites: ['Clinic'],
				teaches: ['Psychiatry'],
				maxStudents: 1,
				availability: [
					...[1, 3, 8, 10].map((day) => ({ day, site: 'Clinic', session: 'am' as const })),
					...[4, 11].map((day) => ({ day, site: 'Clinic', session: 'pm' as const }))
				]
			}
		],
		students: [{ name: 'Student 1', onboardedAt: ['Metro'] }]
	};
}

test.describe('MP-10 half-day preceptors in the planner', { tag: ['@stage2'] }, () => {
	test('All sessions offers half-day preceptors, labels each day, and adds half credit', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, sessionsWorld());
		sandbox.register(world.sandbox);
		const page = asAdmin;
		const plan = new PlanPage(page);
		const s1 = world.ids.student['Student 1'];
		const psych = world.ids.clerkship['Psychiatry'];
		const clinic = world.labels.site['Clinic'];
		const tuesday = addDays(world.anchor, 1);
		const friday = addDays(world.anchor, 4);

		await plan.goto();
		await expect(page.getByTestId('plan-session')).toHaveValue('any');

		// --- The half-day preceptor is offered, with her open days ---
		await plan.requirementCell(s1, psych).click();
		await expect(
			page.getByTestId('plan-preceptor').locator('option', { hasText: 'Dr. Half' })
		).toHaveText('Dr. Half (6 open days)');

		// --- "Full day only" narrows her out; back to All sessions ---
		await page.getByTestId('plan-session').selectOption('full');
		await expect.poll(() => plan.offered('plan-preceptor')).not.toContain('Dr. Half');
		await page.getByTestId('plan-session').selectOption('any');
		await expect.poll(() => plan.offered('plan-preceptor')).toContain('Dr. Half');

		// --- The picker labels each open day with its session ---
		await plan.pick('plan-preceptor', 'Dr. Half');
		await plan.pick('plan-site', clinic);
		const tue = await plan.day(tuesday);
		await expect(tue).toHaveAttribute('data-session', 'am');
		await expect(tue).toContainText('AM');
		await expect(tue).toHaveAttribute('title', /adds a morning/);
		const fri = await plan.day(friday);
		await expect(fri).toHaveAttribute('data-session', 'pm');
		await expect(fri).toContainText('PM');
		// Monday: she doesn't work, so no session.
		const mon = await plan.day(world.anchor);
		await expect(mon).toHaveAttribute('data-state', 'unavailable');
		await expect(mon).not.toHaveAttribute('data-session', /./);

		// --- Pick a morning and an afternoon: half credit each ---
		await plan.pickDays([tuesday, friday]);
		await expect(page.getByTestId('plan-session-mix')).toHaveText('· 1 AM · 1 PM');
		await expect(page.getByTestId('plan-days-ok')).toBeVisible();
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (2)');
		await expect(plan.requirementCell(s1, psych)).toHaveText('0 (+1) / 2');

		await plan.showList();
		await expect(plan.rows().filter({ hasText: tuesday })).toContainText('(AM)');
		await expect(plan.rows().filter({ hasText: friday })).toContainText('(PM)');
		await plan.showCalendar();

		// --- "Pick the next N open days" counts half days as half ---
		await plan.requirementCell(s1, psych).click();
		await plan.pick('plan-preceptor', 'Dr. Half');
		await plan.pick('plan-site', clinic);
		const fill = page.getByTestId('plan-fill-requirement');
		await expect(fill).toHaveText('Pick the next 2 open days');
		await fill.click();
		await expect(page.getByTestId('plan-session-mix')).toHaveText('· 2 AM');
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (4)');
		await expect(plan.requirementCell(s1, psych)).toHaveText('0 (+2) / 2');
		await expect(plan.requirementCell(s1, psych)).toHaveAttribute('data-status', 'met');
	});
});
