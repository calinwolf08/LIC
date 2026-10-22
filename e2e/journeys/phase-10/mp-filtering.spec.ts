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

/** One preceptor free every weekday for three weeks; a 5-day requirement. */
function requirementWorld(): WorldSpec {
	return {
		name: 'Planner requirements',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 5, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. A',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18].map((day) => ({
					day,
					site: 'Clinic',
					session: 'full' as const
				}))
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
		// The date picker shows it: Monday is open, Tuesday is not.
		expect(await (await plan.day(mon)).getAttribute('data-state')).toBe('available');
		expect(await (await plan.day(tue)).getAttribute('data-state')).toBe('unavailable');
		await plan.pickDays([tue]);
		await expect(page.getByTestId('plan-days-summary')).toContainText('not available');
		await expect(plan.addButton()).toBeDisabled();
		// …and the next open days are offered instead, starting with Monday.
		await plan.clearDays();
		await page.getByTestId(`plan-open-date-${mon}`).click();
		expect(await plan.isPicked(mon)).toBe(true);
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

		// --- After adding, the form starts over for the next assignment ---
		await expect(page.getByTestId('plan-student')).toHaveValue('');
		await expect(page.getByTestId('plan-clerkship')).toHaveValue('');
		await expect(page.getByTestId('plan-preceptor')).toHaveValue('');
		await expect(page.getByTestId('plan-dates-count')).toHaveText(/^0 day/);
		expect(await plan.offered('plan-student')).toEqual(['Student 1', 'Student 2']);

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
		await page.getByTestId('plan-session').selectOption('am');
		await plan.pick('plan-clerkship', fm);
		await plan.pickDays([mon]);
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

		// --- The calendar view: opens on the first draft's month; each chip names the
		// student, clerkship and preceptor; clicking one selects it ---
		await plan.showCalendar();
		const first = plan.calendarPin(ids[0]);
		await expect(first).toBeVisible();
		await expect(first).not.toHaveAttribute('data-conflict');
		await expect(first.getByTestId('plan-cal-student')).toHaveText('Student 1');
		await expect(first.getByTestId('plan-cal-clerkship')).toHaveText(fm);
		await expect(first.getByTestId('plan-cal-preceptor')).toHaveText('Dr. FM');
		await page.getByTestId(`plan-cal-open-${ids[0]}`).click();
		await expect(first).toHaveAttribute('data-selected', 'true');
		// …and it's the selected row in the List view too.
		await plan.showList();
		await expect(plan.rows().and(page.locator('[data-selected="true"]'))).toHaveCount(1);
		await expect(page.getByTestId(`plan-pin-${ids[0]}`)).toHaveAttribute('data-selected', 'true');
		await plan.showCalendar();
		// Clicking a day number picks it as the date.
		await plan.clearDays();
		await page.getByTestId(`plan-cal-pick-${mon}`).click();
		expect(await plan.isPicked(mon)).toBe(true);
		// Filtering to Student 2 hides Student 1's drafts.
		await plan.filterStudent('Student 2');
		await expect(plan.calendarPin(ids[0])).toHaveCount(0);
		await plan.filterStudent('');
		await expect(plan.calendarPin(ids[0])).toBeVisible();
		// Selecting the unresolved draft in the list jumps the calendar to it, in red.
		await plan.showList();
		await page.getByTestId(`plan-pin-${overriddenId}`).locator('button').first().click();
		await plan.showCalendar();
		await expect(plan.calendarPin(overriddenId)).toHaveAttribute('data-conflict', 'true');

		// --- Drop the unresolved draft with the × on its calendar chip, then commit the
		// clean ones; they show as saved on the calendar ---
		await plan.removeFromCalendar(overriddenId);
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

	test('requirement progress: days needed, fill to the requirement, over-assignment, summary table', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, requirementWorld());
		sandbox.register(world.sandbox);
		const s2 = world.ids.student['Student 2'];
		const fmId = world.ids.clerkship['Family Medicine'];
		const plan = new PlanPage(asAdmin);
		const page = asAdmin;
		const requirement = page.getByTestId('plan-requirement-status');
		const row = page.getByTestId(`plan-progress-${s2}-${fmId}`);

		await plan.goto();

		// The matrix shows saved (+ planned) / required, coloured by status.
		await expect(row).toHaveText('0 / 5');
		await expect(row).toHaveAttribute('data-status', 'under');

		// Clicking a cell picks that student and clerkship for the next assignment.
		await row.click();
		await expect(page.getByTestId('plan-student')).toHaveValue(s2);
		await expect(page.getByTestId('plan-clerkship')).toHaveValue(fmId);
		await expect(requirement).toHaveText(/5 more day\(s\) needed/);

		// With a preceptor picked, "Pick the next N open days" fills the requirement
		// from their open days.
		await plan.pick('plan-preceptor', 'Dr. A');
		const fill = page.getByTestId('plan-fill-requirement');
		await expect(fill).toHaveText(/next 5 open days/);
		await fill.click();
		await expect(page.getByTestId('plan-dates-count')).toHaveText(/^5 day/);
		await expect(requirement).toHaveText(/Requirement met with this selection/);
		await expect(plan.addButton()).toHaveText(/Add 5 days/);
		await plan.addButton().click();
		await expect(plan.planned()).toHaveText('Planned (5)', { timeout: 15000 });

		// The form resets, and the matrix counts the planned days: met with the plan.
		await expect(page.getByTestId('plan-student')).toHaveValue('');
		await expect(row).toHaveText('0 (+5) / 5');
		await expect(row).toHaveAttribute('data-status', 'met');
		// "Only students who still need days" hides a student with nothing left to do.
		await page.getByTestId('plan-progress-open-only').check();
		await expect(row).toHaveCount(0);
		await page.getByTestId('plan-progress-open-only').uncheck();

		// One more day for the same student and clerkship reads as over the requirement.
		await row.click();
		await expect(requirement).toHaveText(/^\s*Requirement met\.\s*$/);
		await plan.pick('plan-preceptor', 'Dr. A');
		// The fill took the first five weekdays; the next Monday is free.
		const open = addDays(world.anchor, 7);
		await plan.pickDays([open]);
		await expect(requirement).toHaveText(/1 day\(s\) over the requirement with this selection/);
		await expect(page.getByTestId('plan-requirement')).toHaveClass(/amber/);
		await plan.addButton().click();
		await expect(row).toHaveText('0 (+6) / 5');
		await expect(row).toHaveAttribute('data-status', 'over');
	});
});
