// @coverage @scenario(MP-3) @req(R6.1) @req(R6.4)
/**
 * MP-3 — The assignment dialog's eligibility annotations narrow correctly as the
 * coordinator picks, so impossible combinations are visibly disabled (with a
 * reason) rather than silently allowed.
 *
 * World: two sites; Pediatrics is offered only at North and taught only by Dr. Lee;
 * Surgery only at South, taught only by Dr. Patel. The dialog must:
 *   - with Pediatrics selected, disable Dr. Patel (doesn't teach it) and the South
 *     site (not an approved Pediatrics site), while keeping Dr. Lee / North enabled;
 *   - with Dr. Lee selected, disable Surgery (he doesn't teach it);
 *   - with South selected, disable Pediatrics (not offered there).
 */

import { test, expect } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { buildWorld } from '../../worlds/world-builder';
import { eligibilityWorld } from '../../worlds/catalog';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-3 eligibility narrowing', { tag: ['@stage2', '@long'] }, () => {
	test('dialog disables impossible clerkship / preceptor / site combinations', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, eligibilityWorld());
		sandbox.register(world.sandbox);
		const peds = world.labels.clerkship['Pediatrics'];
		const surgery = world.labels.clerkship['Surgery'];
		const north = world.labels.site['North'];
		const south = world.labels.site['South'];
		const dialog = new AssignmentDialog(asAdmin);

		await asAdmin.goto('/calendar');
		await dialog.open();
		await dialog.selectStudent('Student 1');

		// --- Selecting Pediatrics narrows preceptors and sites ---
		await dialog.selectClerkship(peds);
		expect(await dialog.optionDisabled('preceptor', 'Dr. Patel')).toBe(true);
		expect(await dialog.optionDisabled('preceptor', 'Dr. Lee')).toBe(false);
		expect(await dialog.optionDisabled('site', south)).toBe(true);
		expect(await dialog.optionDisabled('site', north)).toBe(false);

		// --- Switching to a preceptor narrows clerkships ---
		await asAdmin.locator('#ad-clerkship').selectOption({ index: 0 }); // clear clerkship
		await dialog.selectPreceptor('Dr. Lee');
		expect(await dialog.optionDisabled('clerkship', surgery)).toBe(true);
		expect(await dialog.optionDisabled('clerkship', peds)).toBe(false);

		// --- Selecting a site narrows clerkships too ---
		await asAdmin.locator('#ad-preceptor').selectOption({ index: 0 }); // clear preceptor
		await dialog.selectSite(south);
		expect(await dialog.optionDisabled('clerkship', peds)).toBe(true);
		expect(await dialog.optionDisabled('clerkship', surgery)).toBe(false);
	});
});
