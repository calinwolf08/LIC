/**
 * J4.1 — Calendar as the workspace (e2e plan Phase 4).
 *
 * The calendar is where a coordinator lives: month/list views (the view carried
 * in the URL), display-only filters that never change the health count, day and
 * chip clicks into the unified dialog, and the empty-state / out-of-range / legend
 * edges. Runs in a populated sandbox with a known set of assignments.
 */

import { test, expect } from '../../fixtures';
import { CalendarPage } from '../../pages/calendar-page';
import { populatedSandbox, createAssignment, freeWeekdayForStudents } from './helpers';

test.describe('J4.1 calendar as the workspace', { tag: ['@stage1'] }, () => {
	test('views, display-only filters, day/chip clicks, and edges', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J4.1 ${Date.now()}`);
		sandbox.register(roster.sandbox);

		const idOf = <T extends { name: string; id: string }>(list: T[], name: string) =>
			list.find((e) => e.name === name)!.id;
		const alice = idOf(roster.students, 'Alice Johnson');
		const bob = idOf(roster.students, 'Bob Williams');
		const carol = idOf(roster.students, 'Carol Martinez');
		const david = idOf(roster.students, 'David Kim');
		const sarah = idOf(roster.preceptors, 'Dr. Sarah Wilson');
		const michael = idOf(roster.preceptors, 'Dr. Michael Lee');
		const amanda = idOf(roster.preceptors, 'Dr. Amanda Smith');
		const peds = idOf(roster.clerkships, 'Pediatrics');
		const fm = idOf(roster.clerkships, 'Family Medicine');
		const community = idOf(roster.sites, 'Community Hospital');
		const metro = idOf(roster.sites, 'Metro General Hospital');

		// The DB enforces a global UNIQUE(student_id, date); pick days free of the
		// seeded Demo rows for each student. Day 1 is shared by the trio (three
		// chips); day 2 is David's own day.
		const d1 = await freeWeekdayForStudents(db, [alice, bob, carol], 8);
		const d2 = await freeWeekdayForStudents(db, [david], 8, [d1]);

		// Day 1 has three chips (three students, three preceptors, two clerkships);
		// day 2 has one. Accept any soft code as a setup safety net (capacity /
		// availability across the seeded Demo load); it does not affect chip counts.
		const safety = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];
		const aliceId = await createAssignment(asAdmin, {
			student_id: alice,
			preceptor_id: sarah,
			clerkship_id: peds,
			site_id: community,
			date: d1,
			override_codes: safety
		});
		const bobId = await createAssignment(asAdmin, {
			student_id: bob,
			preceptor_id: michael,
			clerkship_id: peds,
			site_id: community,
			date: d1,
			override_codes: safety
		});
		await createAssignment(asAdmin, {
			student_id: carol,
			preceptor_id: amanda,
			clerkship_id: fm,
			site_id: metro,
			date: d1,
			override_codes: safety
		});
		await createAssignment(asAdmin, {
			student_id: david,
			preceptor_id: amanda,
			clerkship_id: fm,
			site_id: metro,
			date: d2,
			override_codes: safety
		});

		const cal = new CalendarPage(asAdmin);
		await cal.goto();

		// --- View defaults to calendar; switching to list carries in the URL ---
		expect(cal.viewFromUrl()).toBe('calendar');
		await expect(cal.chips(d1)).toHaveCount(3);
		await cal.setView('list');
		expect(cal.viewFromUrl()).toBe('list');
		// Reload keeps the view (URL-backed).
		await asAdmin.reload();
		await expect(asAdmin.getByRole('button', { name: 'Add assignment' })).toBeVisible({
			timeout: 20000
		});
		expect(cal.viewFromUrl()).toBe('list');
		await cal.setView('calendar');

		// --- Filters are display-only: the health pill never moves ---
		const healthBefore = await cal.health.violationCount();
		await cal.filter({ student: 'Alice Johnson' });
		await expect(cal.chips(d1)).toHaveCount(1); // only Alice remains on d1
		expect(await cal.health.violationCount()).toBe(healthBefore);

		await cal.clearFilters();
		await expect(cal.chips(d1)).toHaveCount(3);

		// Filter by clerkship → the two Pediatrics chips on d1 remain.
		await cal.filter({ clerkship: 'Pediatrics' });
		await expect(cal.chips(d1)).toHaveCount(2);
		await cal.clearFilters();

		// Filter by preceptor → Amanda has one chip each on d1 and d2.
		await cal.filter({ preceptor: 'Dr. Amanda Smith' });
		await expect(cal.chips(d1)).toHaveCount(1);
		await expect(cal.chips(d2)).toHaveCount(1);
		await cal.clearFilters();

		// --- Chip click → edit; empty day → create with the date locked ---
		// (Done while the full schedule range is loaded so every chip is present.)
		const editDialog = await cal.openAssignment(aliceId);
		expect(await editDialog.isEdit).toBe(true);
		await editDialog.cancel();

		// An empty future weekday opens create; the date is pre-filled/locked.
		const emptyDay = await freeWeekdayForStudents(db, [alice], 8, [d1, d2]);
		const createDialog = await cal.clickDay(emptyDay);
		await expect(createDialog.root).toBeVisible();
		expect(await createDialog.selectedDates()).toContain(emptyDay);
		await createDialog.cancel();

		// --- Out-of-range styling: days outside the schedule range are flagged ---
		const outOfRange = cal.grid.locator('[data-in-range="false"]').first();
		await expect(outOfRange).toHaveClass(/out-of-range/);

		// --- Colour legend lists the students in view (same colour key as chips) ---
		await expect(asAdmin.getByTestId('calendar-legend')).toBeVisible();
		await expect(
			asAdmin.locator('[data-testid="legend-entry"]', { hasText: 'Alice Johnson' })
		).toHaveCount(1);

		// --- Date-range filter narrows to d2 only (the dropdown filters and the
		// date range are separate controls: "Clear Filters" resets the dropdowns,
		// not the range) ---
		await cal.filter({ start: d2, end: d2 });
		await expect(cal.chips(d1)).toHaveCount(0);
		await expect(cal.chips(d2)).toHaveCount(1);

		// A range with no assignments shows the list empty-state message.
		const emptyRange = await freeWeekdayForStudents(db, [alice, bob, carol, david], 20, [d1, d2]);
		await cal.filter({ start: emptyRange, end: emptyRange });
		await cal.setView('list');
		await expect(asAdmin.getByText('No assignments found for this date range')).toBeVisible();

		// bob's chip participated in the Pediatrics filter above.
		expect(bobId).toBeTruthy();
	});
});
