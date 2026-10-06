// @coverage @scenario(MP-2) @req(R6.5) @req(R6.6) @finding(CF-L2) @constraint(mutual_exclusion)
/**
 * MP-2 — Edit, reassign and remove under load: the coordinator revises a built
 * schedule and the conflict surfaces track every change.
 *
 *   1. Place Dr. A (AM) on a day — clean.
 *   2. Place Dr. B (PM) on the SAME day — the two preceptors are mutually
 *      exclusive, so the dialog warns; override and the conflict appears on the
 *      student panel and in the validator (and, because they are different sessions,
 *      with NO session_clash).
 *   3. Remove Dr. B's day via the edit dialog → the mutual-exclusion conflict clears.
 *   4. Reassign a different day from Dr. A to Dr. B via the edit dialog → the row
 *      now shows Dr. B and the schedule stays clean.
 *   5. Remove that day → it is gone from the student's list.
 */

import { test, expect } from '../../fixtures';
import { AssignmentDialog, StudentSchedulePage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { mutualExclusionWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-2 edit / reassign / remove', { tag: ['@stage2', '@long'] }, () => {
	test('introduce then resolve a mutual-exclusion conflict; reassign and remove', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(360000); // long journey: many full-page navigations + edits
		const world = await buildWorld(asAdmin, db as Kysely<DB>, mutualExclusionWorld());
		sandbox.register(world.sandbox);
		const s1 = world.ids.student['Student 1'];
		const fm = world.labels.clerkship['Family Medicine'];
		const clinic = world.labels.site['Clinic'];
		const dayX = world.anchor;
		const dayY = addDays(world.anchor, 1);
		const dialog = new AssignmentDialog(asAdmin);
		const page = new StudentSchedulePage(asAdmin);

		const place = async (preceptor: string, date: string, session: 'full' | 'am' | 'pm') => {
			await asAdmin.goto('/calendar');
			await dialog.open();
			await dialog.selectStudent('Student 1');
			await dialog.selectClerkship(fm);
			await dialog.selectPreceptor(preceptor);
			await dialog.selectSite(clinic);
			await dialog.pickDay(date);
			await dialog.setSession(session);
			await dialog.submitAndExpectCreated();
		};

		// --- 1 & 2. Dr. A (AM) then Dr. B (PM) on the same day → mutual exclusion ---
		await place('Dr. A', dayX, 'am');
		await place('Dr. B', dayX, 'pm');

		await page.goto(s1);
		expect(await page.hasConflict('mutual_exclusion', dayX)).toBe(true);
		let v = await readValidation(asAdmin);
		expect(countOf(v, 'mutual_exclusion')).toBeGreaterThan(0);
		expect(countOf(v, 'session_clash')).toBe(0); // AM vs PM don't overlap

		// --- 3. Remove Dr. B's day → the conflict clears ---
		await page.openEditForDate(s1, dayX, 'Dr. B');
		await dialog.remove();
		await page.goto(s1);
		expect(await page.hasConflict('mutual_exclusion', dayX)).toBe(false);
		expect(countOf(await readValidation(asAdmin), 'mutual_exclusion')).toBe(0);

		// --- 4. Reassign a fresh day from Dr. A to Dr. B → row updates, stays clean ---
		await place('Dr. A', dayY, 'full');
		await page.openEditForDate(s1, dayY, 'Dr. A');
		await dialog.selectPreceptor('Dr. B');
		await dialog.submit();
		await expect(asAdmin.getByText(/assignment updated/i).last()).toBeVisible({ timeout: 15000 });
		await page.goto(s1);
		await page.openScheduleList();
		await expect(page.row(dayY, 'Dr. B')).toBeVisible();
		await expect(page.row(dayY, 'Dr. A')).toHaveCount(0);

		// --- 5. Remove that day → gone from the list ---
		await page.openEditForDate(s1, dayY, 'Dr. B');
		await dialog.remove();
		await page.goto(s1);
		await page.openScheduleList();
		await expect(page.row(dayY, 'Dr. B')).toHaveCount(0);
	});
});
