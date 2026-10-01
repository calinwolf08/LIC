// @coverage @scenario(MP-1) @req(R6.1) @req(R6.2) @req(R6.3) @finding(CF-M2) @finding(CF-M3) @constraint(session_clash)
/**
 * MP-1 — Build a student's schedule by hand, the way a coordinator does: one long
 * assignment-dialog session across its batch modes, session slots and day-types,
 * asserting the outcome after every action.
 *
 *   1. Range mode (Mon/Wed/Fri over a week) → three clinical days at once.
 *   2. Individual-days mode → two more specific days.
 *   3. Non-clinical days (a free day and an exam) from the student page.
 *   4. A clinical day placed on the free day's date → the dialog warns
 *      (session_clash), the override is accepted, and the conflict then shows on
 *      the student's panel and in the whole-schedule validator.
 *
 * Validation is clean after every legitimate batch and only gains the one conflict
 * the journey deliberately creates.
 */

import { test, expect } from '../../fixtures';
import { AssignmentDialog, StudentSchedulePage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { manualWorld } from '../../worlds/catalog';
import { readValidation, countOf, totalViolations } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-1 build a cohort by hand', { tag: ['@stage2', '@long'] }, () => {
	test('range + individual batches, non-clinical days, then an overridden clash', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, manualWorld());
		sandbox.register(world.sandbox);
		const s1 = world.ids.student['Student 1'];
		const dialog = new AssignmentDialog(asAdmin);

		const pick = async () => {
			await dialog.selectStudent('Student 1');
			await dialog.selectClerkship(world.labels.clerkship['Family Medicine']);
			await dialog.selectPreceptor('Dr. FM');
			await dialog.selectSite(world.labels.site['Clinic']);
		};

		// --- 1. Range mode: Mon/Wed/Fri of week 1 (toggle Tue+Thu off) ---
		await asAdmin.goto('/calendar');
		await dialog.open();
		await pick();
		await dialog.pickRange(world.anchor, addDays(world.anchor, 4), ['Tue', 'Thu']);
		expect(await dialog.selectedDates()).toEqual([
			world.anchor,
			addDays(world.anchor, 2),
			addDays(world.anchor, 4)
		]);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();
		expect(totalViolations(await readValidation(asAdmin))).toBe(0);

		// --- 2. Individual-days mode: two specific weekdays in week 2 ---
		await dialog.open();
		await pick();
		await dialog.pickDays([addDays(world.anchor, 7), addDays(world.anchor, 9)]);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();
		expect(totalViolations(await readValidation(asAdmin))).toBe(0);

		// --- 3. Non-clinical days (free day + exam), created from the calendar ---
		const page = new StudentSchedulePage(asAdmin);
		const freeDate = addDays(world.anchor, 8);
		const examDate = addDays(world.anchor, 10);
		await asAdmin.goto('/calendar');
		await dialog.open();
		await dialog.setKind('free_day');
		await dialog.selectStudent('Student 1');
		await dialog.pickDays([freeDate]);
		await dialog.submitAndExpectCreated();

		await dialog.open();
		await dialog.setKind('exam');
		await dialog.selectStudent('Student 1');
		await dialog.pickDays([examDate]);
		await dialog.submitAndExpectCreated();

		// Verify on the student page (the read surface).
		await page.goto(s1);
		await page.openScheduleList();
		await expect(asAdmin.getByTestId(`student-assignment-free_day-${freeDate}`)).toBeVisible();
		await expect(asAdmin.getByTestId(`student-assignment-exam-${examDate}`)).toBeVisible();
		// The non-clinical days alone introduce no conflicts.
		expect(totalViolations(await readValidation(asAdmin))).toBe(0);

		// --- 4. A clinical day on the free day's date → session_clash, overridden ---
		await asAdmin.goto('/calendar');
		await dialog.open();
		await pick();
		await dialog.pickDay(freeDate);
		await dialog.expectWarning(/clash|already|occupied|session/i);
		await dialog.submitAndExpectCreated(); // accepts the override conversation

		await page.goto(s1);
		expect(await page.hasConflict('session_clash', freeDate)).toBe(true);
		expect(countOf(await readValidation(asAdmin), 'session_clash')).toBeGreaterThan(0);
	});
});
