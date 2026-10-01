// @coverage @scenario(AG-1) @req(R3.1) @req(R7) @req(R8) @constraint(block_week_conflict) @constraint(session_clash)
/**
 * AG-1 — Full auto-generation honors the block/scatter (L3) constraint at
 * multi-student scale, driven through the REAL Generate dialog.
 *
 * World (see worlds/catalog.ts `blockScatterWorld`): two students, an inpatient
 * BLOCK clerkship and an outpatient SCATTERED clerkship on separate sites; the
 * scatter preceptor is available both inside the block week and in the free week.
 * A correct full generation must place every student's block on its Monday and
 * their scattered day in the FREE week — never in the block's week.
 *
 * Asserts the outcome across all surfaces a coordinator relies on:
 *   - DB: exact placements per student (block Monday, scatter free-week).
 *   - validation API: zero block_week_conflict / session_clash.
 *   - calendar Schedule-health panel: no conflicts.
 *   - each student's conflict panel: no block_week_conflict.
 *   - results page: complete.
 */

import { test, expect, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage, HealthPanel, StudentSchedulePage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { blockScatterWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('AG-1 full generation honors block/scatter at scale', { tag: ['@stage2', '@long'] }, () => {
	test('block on its Monday, scattered in the free week, zero conflicts', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, blockScatterWorld(2));
		sandbox.register(world.sandbox);

		const blockMon = world.anchor;
		const blockWeekWed = addDays(world.anchor, 2);
		const freeMon = addDays(world.anchor, 7);
		const imId = world.ids.clerkship['Inpatient Medicine'];
		const fmId = world.ids.clerkship['Family Medicine'];

		// --- Generate through the real dialog (full mode) ---
		await new GeneratePage(asAdmin).generate('full');

		// --- DB: every student placed correctly, L3 honored ---
		const rows = await assignmentsForSchedule(kysely, world.scheduleId);
		expect(rows.length).toBe(4); // 2 students × (block + scatter)
		expect(rows.every((r) => r.source === 'generated')).toBe(true);

		for (const name of ['Student 1', 'Student 2']) {
			const sid = world.ids.student[name];
			const mine = rows.filter((r) => r.student_id === sid);
			const block = mine.find((r) => r.clerkship_id === imId);
			const scatter = mine.find((r) => r.clerkship_id === fmId);
			expect(block?.date, `${name} block on Monday`).toBe(blockMon);
			expect(scatter?.date, `${name} scatter in free week`).toBe(freeMon);
			expect(scatter?.date, `${name} scatter NOT in block week`).not.toBe(blockWeekWed);
		}

		// --- validation API: clean on the two constraints this world stresses ---
		const v = await readValidation(asAdmin);
		expect(countOf(v, 'block_week_conflict')).toBe(0);
		expect(countOf(v, 'session_clash')).toBe(0);

		// --- calendar Schedule-health panel agrees (no conflicts) ---
		await asAdmin.goto('/calendar');
		const health = new HealthPanel(asAdmin);
		expect(await health.violationCount()).toBe(0);

		// --- each student's own conflict panel shows no block-week conflict ---
		for (const name of ['Student 1', 'Student 2']) {
			const page = new StudentSchedulePage(asAdmin);
			await page.goto(world.ids.student[name]);
			expect(await page.hasConflict('block_week_conflict')).toBe(false);
		}

		// --- results page reads complete ---
		const gen = new GeneratePage(asAdmin);
		await gen.gotoResults();
		expect(await gen.resultsComplete()).toBe(true);
	});
});
