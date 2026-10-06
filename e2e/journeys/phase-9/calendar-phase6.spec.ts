// @coverage @finding(CF-J1) @finding(CF-J2) @finding(CF-J3) @finding(CF-I3) @req(R8.2)
/**
 * Phase 6 — the calendar as a workspace.
 *
 * CF-J1: display-only toggles (show assigned days / show availability).
 * CF-J2: list view rendered as a dense per-date table.
 * CF-J3: block/grid view — rows=students, columns=dates, filled cells for blocks.
 * CF-I3: calendar range selection opens the dialog in range mode with clear
 *        "range vs individual" copy and the span preselected.
 *
 * Each test stands up its own populated sandbox with a known set of assignments.
 */

import { test, expect } from '../../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';
import { CalendarPage } from '../../pages/calendar-page';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox, createAssignment, freeWeekdayForStudents } from '../phase-4/helpers';

const idOf = <T extends { name: string; id: string }>(list: T[], name: string) =>
	list.find((e) => e.name === name)!.id;

// Accept every soft warning our arbitrary student/preceptor pairings might raise
// (capacity, availability, onboarding, core-preceptor, preferred-day) — none
// affect what these display-layer tests assert.
const SAFETY = [
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available'
];

test.describe('Phase 6 calendar workspace', { tag: ['@stage1'] }, () => {
	test('CF-J2 list view is a per-date table', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `CF-J2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const alice = idOf(roster.students, 'Alice Johnson');
		const bob = idOf(roster.students, 'Bob Williams');
		const amanda = idOf(roster.preceptors, 'Dr. Amanda Smith');
		const fm = idOf(roster.clerkships, 'Family Medicine');
		const metro = idOf(roster.sites, 'Metro General Hospital');

		const d1 = await freeWeekdayForStudents(db as Kysely<DB>, [alice, bob], 8);
		await createAssignment(asAdmin, {
			student_id: alice,
			preceptor_id: amanda,
			clerkship_id: fm,
			site_id: metro,
			date: d1,
			override_codes: SAFETY
		});
		await createAssignment(asAdmin, {
			student_id: bob,
			preceptor_id: amanda,
			clerkship_id: fm,
			site_id: metro,
			date: d1,
			override_codes: SAFETY
		});

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		await cal.filter({ start: d1, end: d1 });
		await cal.setView('list');

		const group = asAdmin.getByTestId('list-date-group').first();
		const table = group.getByTestId('list-table');
		await expect(table).toBeVisible({ timeout: 15000 });
		// Table headers make it read like a spreadsheet, not a card list.
		await expect(table.locator('thead th', { hasText: 'Student' })).toBeVisible();
		await expect(table.locator('thead th', { hasText: 'Preceptor' })).toBeVisible();
		// Two assignments on this date → two rows.
		await expect(group.getByTestId('list-row')).toHaveCount(2);
	});

	test('CF-J1 display toggles hide assignments and overlay availability', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-J1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const alice = idOf(roster.students, 'Alice Johnson');
		const amanda = idOf(roster.preceptors, 'Dr. Amanda Smith');
		const fm = idOf(roster.clerkships, 'Family Medicine');
		const metro = idOf(roster.sites, 'Metro General Hospital');

		const d1 = await freeWeekdayForStudents(kysely, [alice], 8);
		await createAssignment(asAdmin, {
			student_id: alice,
			preceptor_id: amanda,
			clerkship_id: fm,
			site_id: metro,
			date: d1,
			override_codes: SAFETY
		});

		// A known availability day for Amanda in range (overlay target).
		const ts = new Date().toISOString();
		await kysely
			.deleteFrom('preceptor_availability')
			.where('preceptor_id', '=', amanda)
			.where('date', '=', d1)
			.execute();
		await kysely
			.insertInto('preceptor_availability')
			.values({
				id: crypto.randomUUID(),
				preceptor_id: amanda,
				site_id: metro,
				date: d1,
				is_available: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		await cal.filter({ start: d1, end: d1 });

		const healthBefore = await cal.health.violationCount();
		await expect(cal.chips(d1)).toHaveCount(1);

		// "Show assigned days" is display-only: hides the chip, health unchanged.
		await cal.toggleAssigned(false);
		await expect(cal.chips(d1)).toHaveCount(0);
		expect(await cal.health.violationCount()).toBe(healthBefore);
		await cal.toggleAssigned(true);
		await expect(cal.chips(d1)).toHaveCount(1);

		// "Show availability" overlays the filtered preceptor's open days.
		await cal.filter({ preceptor: 'Dr. Amanda Smith' });
		await cal.toggleAvailability(true);
		await expect(asAdmin.getByTestId(`cal-availability-${d1}`).first()).toBeVisible({
			timeout: 15000
		});
		expect(await cal.health.violationCount()).toBe(healthBefore);
	});

	test('CF-J3 block grid shows students as rows and blocks as filled cells', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-J3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const alice = idOf(roster.students, 'Alice Johnson');
		const amanda = idOf(roster.preceptors, 'Dr. Amanda Smith');
		const fm = idOf(roster.clerkships, 'Family Medicine');
		const metro = idOf(roster.sites, 'Metro General Hospital');

		// Two contiguous weekdays for a visible block.
		const d1 = await freeWeekdayForStudents(kysely, [alice], 8);
		const d2 = await freeWeekdayForStudents(kysely, [alice], 9, [d1]);
		for (const date of [d1, d2]) {
			await createAssignment(asAdmin, {
				student_id: alice,
				preceptor_id: amanda,
				clerkship_id: fm,
				site_id: metro,
				date,
				override_codes: SAFETY
			});
		}

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		await cal.setView('grid');

		await expect(asAdmin.getByTestId('block-grid')).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`grid-row-${alice}`)).toBeVisible();
		// Both assigned days are filled cells for the student's row.
		await expect(asAdmin.getByTestId(`grid-cell-${alice}-${d1}`)).toHaveAttribute(
			'data-filled',
			'true'
		);
		await expect(asAdmin.getByTestId(`grid-cell-${alice}-${d2}`)).toHaveAttribute(
			'data-filled',
			'true'
		);
	});

	test('CF-I3 range selection opens the dialog in range mode with copy', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-I3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const alice = idOf(roster.students, 'Alice Johnson');

		// Two free weekdays to anchor the range.
		const start = await freeWeekdayForStudents(kysely, [alice], 8);
		const end = await freeWeekdayForStudents(kysely, [alice], 9, [start]);
		const [lo, hi] = start <= end ? [start, end] : [end, start];

		const cal = new CalendarPage(asAdmin);
		await cal.goto();

		// Enter range-select mode, then click the two anchor days.
		await asAdmin.getByTestId('toggle-range-select').click();
		await expect(asAdmin.getByTestId('range-select-hint')).toBeVisible();
		await cal.dayCell(lo).click();
		await cal.dayCell(hi).click();

		// The dialog opens in range mode with the "range vs individual" explanation
		// and the span preselected.
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.waitUntilOpen();
		await expect(asAdmin.getByTestId('range-mode-help')).toBeVisible();
		await expect(asAdmin.getByRole('button', { name: 'Range', exact: true })).toHaveClass(/bg-primary/);
		const selected = await dialog.selectedDates();
		expect(selected).toContain(lo);
		expect(selected).toContain(hi);
	});
});
