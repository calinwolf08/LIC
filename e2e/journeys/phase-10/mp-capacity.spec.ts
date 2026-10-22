// @coverage @scenario(MP-9) @req(R6.1) @req(R6.2)
// @coverage @constraint(preceptor_capacity) @constraint(block_week_conflict)
/**
 * MP-9 — The planner knows when the schedule is running out of room, and keeps
 * outpatient days out of inpatient block weeks before they reach the plan.
 *
 *   - The preceptor picker shows how many open days each preceptor has left; once a
 *     preceptor is full they drop out of the list ("No open days left" under
 *     "Show all options").
 *   - The Preceptor capacity card lists each preceptor's open days and places, and
 *     warns when the places left can't cover the days the students still need.
 *   - With a student on an inpatient block, the days of that week are marked in the
 *     date picker and, if picked, explained in plain words — before anything is
 *     added. Overriding stages it, and the conflict panel names it clearly.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays, type WorldSpec } from '../../worlds/world-builder';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const WEEKDAYS = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18];

function capacityWorld(): WorldSpec {
	const full = (days: number[], site: string) =>
		days.map((day) => ({ day, site, session: 'full' as const }));
	return {
		name: 'Planner capacity',
		healthSystems: ['Metro'],
		sites: [
			{ name: 'Clinic', healthSystem: 'Metro' },
			{ name: 'Hospital', healthSystem: 'Metro' }
		],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 10, sites: ['Clinic'] },
			{
				name: 'Surgery',
				type: 'inpatient',
				kind: 'block',
				requiredDays: 5,
				sites: ['Hospital']
			}
		],
		preceptors: [
			// Two days, one student a day.
			{
				name: 'Dr. Small',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				maxStudents: 1,
				availability: full([0, 1], 'Clinic')
			},
			{
				name: 'Dr. Big',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				maxStudents: 1,
				availability: full(WEEKDAYS, 'Clinic')
			},
			// The second week only.
			{
				name: 'Dr. Surg',
				sites: ['Hospital'],
				teaches: ['Surgery'],
				maxStudents: 1,
				availability: full([7, 8, 9, 10, 11], 'Hospital')
			}
		],
		students: [
			{ name: 'Student 1', onboardedAt: ['Metro'] },
			{ name: 'Student 2', onboardedAt: ['Metro'] }
		]
	};
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('MP-9 preceptor capacity and inpatient block weeks', { tag: ['@stage2'] }, () => {
	test('full preceptors drop out, capacity is shown, block weeks are explained before adding', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, capacityWorld());
		sandbox.register(world.sandbox);
		const page = asAdmin;
		const plan = new PlanPage(page);
		const small = world.ids.preceptor['Dr. Small'];
		const big = world.ids.preceptor['Dr. Big'];
		const fm = world.labels.clerkship['Family Medicine'];
		const surgery = world.labels.clerkship['Surgery'];
		const clinic = world.labels.site['Clinic'];
		const hospital = world.labels.site['Hospital'];
		const preceptorOption = (name: string) =>
			page.getByTestId('plan-preceptor').locator('option', { hasText: name });

		await plan.goto();

		// --- The capacity card: room per preceptor vs the days still needed ---
		// Places: Dr. Small 2 + Dr. Big 15 + Dr. Surg 5 = 22.
		// Needed: 2 students × (Family Medicine 10 + Surgery 5) = 30.
		const capacity = page.getByTestId('plan-capacity');
		await expect(capacity).toBeVisible();
		await expect(page.getByTestId(`plan-capacity-${small}`)).toContainText('2 days · 2 places');
		await expect(page.getByTestId(`plan-capacity-${big}`)).toContainText('15 days · 15 places');
		const summary = page.getByTestId('plan-capacity-summary');
		await expect(summary).toHaveText(
			/22 places left · 30 days still needed — not enough room for 8 more/
		);
		await expect(summary).toHaveAttribute('data-short', 'true');

		// --- The picker says how many open days each preceptor has ---
		await plan.pick('plan-student', 'Student 1');
		await plan.pick('plan-clerkship', fm);
		await expect(preceptorOption('Dr. Small')).toHaveText('Dr. Small (2 open days)');
		await expect(preceptorOption('Dr. Big')).toHaveText('Dr. Big (15 open days)');

		// Fill both of Dr. Small's days with Student 1.
		await plan.pick('plan-preceptor', 'Dr. Small');
		await plan.pick('plan-site', clinic);
		await plan.pickDays([world.anchor, addDays(world.anchor, 1)]);
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (2)');

		// Dr. Small is now full, and the card says so.
		await expect(page.getByTestId(`plan-capacity-${small}`)).toContainText('Full');
		await expect(page.getByTestId(`plan-capacity-${small}`)).toHaveAttribute('data-open-days', '0');
		await expect(summary).toHaveText(/20 places left · 28 days still needed/);

		// --- A full preceptor isn't offered for the next student ---
		await plan.pick('plan-student', 'Student 2');
		await plan.pick('plan-clerkship', fm);
		await expect(preceptorOption('Dr. Big')).toHaveText('Dr. Big (15 open days)');
		await expect.poll(() => plan.offered('plan-preceptor')).not.toContain('Dr. Small');
		await expect(page.getByTestId('plan-hidden-preceptor')).toBeVisible();
		// …unless "Show all options" is on, which says why.
		await plan.showAll(true);
		await expect(preceptorOption('Dr. Small')).toHaveText('Dr. Small — No open days left');
		await plan.showAll(false);
		await expect(preceptorOption('Dr. Small')).toHaveCount(0);

		// --- Put Student 2 on Surgery (an inpatient block) in the second week ---
		const blockMonday = addDays(world.anchor, 7);
		const blockTuesday = addDays(world.anchor, 8);
		await plan.pick('plan-clerkship', surgery);
		await plan.pick('plan-preceptor', 'Dr. Surg');
		await plan.pick('plan-site', hospital);
		await plan.pickDays([blockMonday]);
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (3)');
		await expect(page.getByTestId('plan-conflict-count')).toHaveText('0');

		// --- An outpatient day that week is flagged in the date picker… ---
		await plan.pick('plan-student', 'Student 2');
		await plan.pick('plan-clerkship', fm);
		await plan.pick('plan-preceptor', 'Dr. Big');
		await plan.pick('plan-site', clinic);
		const blocked = await plan.day(blockTuesday);
		await expect(blocked).toHaveAttribute('data-state', 'block-week');
		await expect(blocked).toHaveAttribute('title', /inpatient block/);
		await expect(await plan.day(addDays(world.anchor, 14))).toHaveAttribute(
			'data-state',
			'available'
		);

		// …and, picked anyway, explained in plain words before anything is added.
		await plan.pickDays([blockTuesday]);
		const explained = new RegExp(
			`Student 2 is on ${escape(surgery)} \\(an inpatient block\\) the week of ${blockMonday}\\. ` +
				`Inpatient blocks take the whole week, so outpatient days can't go that week\\.`
		);
		await expect(page.getByTestId('plan-skipped-days')).toContainText(explained);
		await expect(plan.addButton()).toBeDisabled();
		await expect(plan.planned()).toHaveText('Planned (3)');
		await expect(page.getByTestId('plan-conflict-count')).toHaveText('0');

		// --- Overriding stages it; the conflict panel names it clearly ---
		await plan.addPin(
			{
				student: 'Student 2',
				clerkship: fm,
				preceptor: 'Dr. Big',
				site: clinic,
				date: blockTuesday
			},
			{ override: true }
		);
		await expect(plan.planned()).toHaveText('Planned (4)');
		await expect(plan.conflictRow('block_week_conflict')).toContainText(
			'Clashes with an inpatient block week (blocks take the whole week)'
		);
	});
});
