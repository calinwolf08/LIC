// @coverage @scenario(MP-7) @req(R6.1) @req(R6.2)
// @coverage @constraint(preceptor_unavailable) @constraint(preceptor_not_teaching)
// @coverage @constraint(preceptor_wrong_site) @constraint(preceptor_capacity) @constraint(session_clash)
/**
 * MP-7 — The planner only offers choices that work, and shows the plan on a calendar.
 *
 *   - Picks filter each other in any order: a clerkship narrows the preceptors and
 *     sites to those who teach it and the sites it runs at; a preceptor narrows the
 *     clerkships the same way.
 *   - A day the preceptor isn't available (no availability, or only the morning for
 *     a full day) isn't offered: the form says why, Add is disabled, and the next
 *     open days are suggested. A range stages only the days that work.
 *   - Choices that clash with other draft pins (the student already booked) are
 *     filtered too.
 *   - "Show all options" lists everything with the reason; adding a conflicting
 *     choice asks for confirmation, marks the pin "Overridden", and the dry run
 *     reports every conflict — including a preceptor who isn't available that day
 *     and one who doesn't teach the clerkship, which used to go unreported.
 *   - The calendar under the planner shows saved assignments and drafts, highlights
 *     the open days and conflicts, selects a draft on click, and picks a date when a
 *     day is clicked.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays, type WorldSpec } from '../../worlds/world-builder';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const WEEKDAYS = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];

function filteringWorld(): WorldSpec {
	const full = (days: number[], site: string) =>
		days.map((day) => ({ day, site, session: 'full' as const }));
	return {
		name: 'Planner filtering',
		healthSystems: ['Metro'],
		sites: [
			{ name: 'Clinic', healthSystem: 'Metro' },
			{ name: 'Hospital', healthSystem: 'Metro' }
		],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 20, sites: ['Clinic'] },
			{ name: 'Internal Medicine', type: 'outpatient', requiredDays: 20, sites: ['Hospital'] }
		],
		preceptors: [
			// Mondays, Wednesdays and Fridays only.
			{
				name: 'Dr. FM',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				maxStudents: 1,
				availability: full([0, 2, 4, 7, 9, 11], 'Clinic')
			},
			// Every weekday, but only the morning of the first Monday.
			{
				name: 'Dr. Half',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [
					{ day: 0, site: 'Clinic', session: 'am' as const },
					...full(
						WEEKDAYS.filter((d) => d !== 0),
						'Clinic'
					)
				]
			},
			{
				name: 'Dr. IM',
				sites: ['Hospital'],
				teaches: ['Internal Medicine'],
				availability: full(WEEKDAYS, 'Hospital')
			}
		],
		students: [
			{ name: 'Student 1', onboardedAt: ['Metro'] },
			{ name: 'Student 2', onboardedAt: ['Metro'] }
		]
	};
}

test.describe('MP-7 planner filtering and calendar', { tag: ['@stage2'] }, () => {
	test('pickers offer only valid choices, overrides are confirmed, the calendar shows the plan', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, filteringWorld());
		sandbox.register(world.sandbox);
		const fm = world.labels.clerkship['Family Medicine'];
		const im = world.labels.clerkship['Internal Medicine'];
		const clinic = world.labels.site['Clinic'];
		const hospital = world.labels.site['Hospital'];
		const mon = world.anchor;
		const tue = addDays(mon, 1);
		const plan = new PlanPage(asAdmin);
		const page = asAdmin;

		await plan.goto();
		await expect(plan.calendar()).toBeVisible();

		// --- A clerkship narrows preceptors and sites; a preceptor narrows clerkships ---
		await plan.pick('plan-clerkship', im);
		await expect.poll(() => plan.offered('plan-preceptor')).toEqual(['Dr. IM']);
		await expect.poll(() => plan.offered('plan-site')).toEqual([hospital]);
		await expect(page.getByTestId('plan-hidden-preceptor')).toContainText('2 hidden');

		await page.getByTestId('plan-clerkship').selectOption('');
		await plan.pick('plan-preceptor', 'Dr. FM');
		await expect.poll(() => plan.offered('plan-clerkship')).toEqual([fm]);
		await expect.poll(() => plan.offered('plan-site')).toEqual([clinic]);
		// The only site left is picked for you.
		await expect(page.getByTestId('plan-site')).toHaveValue(world.ids.site['Clinic']);

		// "Show all options" brings the others back, each with its reason.
		await plan.showAll(true);
		await expect
			.poll(() => page.getByTestId('plan-clerkship').textContent())
			.toContain('Doesn’t teach this clerkship');
		await plan.showAll(false);

		// --- A day the preceptor doesn't work isn't offered ---
		await plan.pick('plan-student', 'Student 1');
		await plan.pick('plan-clerkship', fm);
		await page.getByTestId('plan-date').fill(tue);
		await expect(page.getByTestId('plan-days-summary')).toContainText('not available');
		await expect(plan.addButton()).toBeDisabled();
		// …and the next open days are offered instead, starting with Monday.
		await page.getByTestId(`plan-open-date-${mon}`).click();
		await expect(page.getByTestId('plan-date')).toHaveValue(mon);
		await expect(page.getByTestId('plan-days-ok')).toBeVisible();
		// The calendar tints the open days for this selection.
		await expect(page.getByTestId(`plan-cal-day-${mon}`)).toHaveAttribute('data-open', 'true');
		await expect(page.getByTestId(`plan-cal-day-${tue}`)).not.toHaveAttribute('data-open');

		// --- A range stages only the days that work (Mon/Wed/Fri of two weeks) ---
		const staged = await plan.addRange(
			{ student: 'Student 1', clerkship: fm, preceptor: 'Dr. FM', site: clinic },
			mon,
			addDays(mon, 11)
		);
		expect(staged).toBe(6);
		await expect(plan.conflictCount()).toHaveText('0');

		// --- Draft pins filter too: Dr. FM (one student a day) is full on Monday,
		// and Student 1 is booked ---
		await plan.addPin({
			student: 'Student 2',
			clerkship: fm,
			preceptor: 'Dr. Half',
			site: clinic,
			session: 'pm',
			date: tue
		});
		await page.getByTestId('plan-preceptor').selectOption('');
		await page.getByTestId('plan-student').selectOption('');
		await page.getByTestId('plan-session').selectOption('am');
		await page.getByTestId('plan-date').fill(mon);
		await expect
			.poll(() => page.getByTestId('plan-student').textContent())
			.not.toContain('Student 1');
		await plan.pick('plan-student', 'Student 2');
		await expect.poll(() => plan.offered('plan-preceptor')).toEqual(['Dr. Half']);

		// --- Half-day availability: Dr. Half works only the morning of Monday ---
		await plan.pick('plan-preceptor', 'Dr. Half');
		await page.getByTestId('plan-session').selectOption('full');
		await expect(page.getByTestId('plan-days-summary')).toContainText('not available');
		await page.getByTestId('plan-session').selectOption('am');
		await expect(page.getByTestId('plan-days-ok')).toBeVisible();

		// --- Override: Dr. IM for Family Medicine at the clinic on a Saturday ---
		const saturday = addDays(mon, 5);
		await plan.addPin(
			{
				student: 'Student 2',
				clerkship: fm,
				preceptor: 'Dr. IM',
				site: clinic,
				date: saturday
			},
			{ override: true }
		);
		const ids = await plan.pinIds();
		const overriddenId = ids[ids.length - 1];
		await expect(plan.overridden(overriddenId)).toBeVisible();
		await expect(plan.status(overriddenId)).toHaveText('OK');
		// Every conflict on it is reported, not just the site.
		for (const code of [
			'preceptor_unavailable',
			'preceptor_not_teaching',
			'preceptor_wrong_site'
		]) {
			await expect(plan.conflictRow(code), `${code} reported`).toBeVisible();
		}
		// Reset drops the override: the pin is back to needing attention.
		await plan.resetOverrides(overriddenId);
		await expect(plan.status(overriddenId)).toHaveText(/to resolve/i);
		await expect(plan.overridden(overriddenId)).toHaveCount(0);

		// --- The calendar opens on the first draft's month; clicking a draft selects
		// it in the list ---
		await expect(plan.calendarPin(ids[0])).toBeVisible();
		await expect(plan.calendarPin(ids[0])).not.toHaveAttribute('data-conflict');
		await plan.calendarPin(ids[0]).click();
		await expect(plan.rows().and(page.locator('[data-selected="true"]'))).toHaveCount(1);
		await expect(page.getByTestId(`plan-pin-${ids[0]}`)).toHaveAttribute('data-selected', 'true');
		// Clicking a day picks it as the date.
		await page.getByTestId(`plan-cal-pick-${mon}`).click();
		await expect(page.getByTestId('plan-date')).toHaveValue(mon);
		// Filtering to Student 2 hides Student 1's drafts.
		await plan.pick('plan-cal-student', 'Student 2');
		await expect(plan.calendarPin(ids[0])).toHaveCount(0);
		await page.getByTestId('plan-cal-student').selectOption('');
		await expect(plan.calendarPin(ids[0])).toBeVisible();
		// Selecting the unresolved draft in the list jumps the calendar to it, in red.
		await page.getByTestId(`plan-pin-${overriddenId}`).locator('button').first().click();
		await expect(plan.calendarPin(overriddenId)).toHaveAttribute('data-conflict', 'true');

		// --- Commit the clean pins; they show as saved on the calendar ---
		await plan.removePin(overriddenId);
		await expect(plan.commitButton()).toHaveText(/Commit 7 assignments/);
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 7 assignments/);
		await expect(page.locator('[data-testid^="plan-cal-saved-"]').first()).toBeVisible();
		const saved = await kysely
			.selectFrom('schedule_assignments')
			.select('id')
			.where('schedule_id', '=', world.scheduleId)
			.execute();
		expect(saved).toHaveLength(7);
	});

	// Regression: a clerkship picked by click (the select keeps focus) was cleared
	// when choosing a preceptor narrowed the clerkship list (Svelte select binding).
	test('a pick made with focus survives the other pickers narrowing its list', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(120000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, filteringWorld());
		sandbox.register(world.sandbox);
		const fm = world.labels.clerkship['Family Medicine'];
		const plan = new PlanPage(asAdmin);
		const page = asAdmin;

		await plan.goto();
		await plan.pickByKeyboard('plan-student', 'Student 1');
		await plan.pickByKeyboard('plan-clerkship', fm);
		await expect.poll(() => plan.offered('plan-preceptor')).toEqual(['Dr. FM', 'Dr. Half']);
		// Choosing the preceptor drops Internal Medicine from the clerkship list…
		await plan.pickByKeyboard('plan-preceptor', 'Dr. FM');
		await expect.poll(() => plan.offered('plan-clerkship')).toEqual([fm]);
		// …and Family Medicine stays picked, in the page and in the select.
		await expect(page.getByTestId('plan-clerkship')).toHaveValue(
			world.ids.clerkship['Family Medicine']
		);
		await expect(page.getByTestId('plan-student')).toHaveValue(world.ids.student['Student 1']);
		await expect(page.getByTestId('plan-site')).toHaveValue(world.ids.site['Clinic']);
	});
});
