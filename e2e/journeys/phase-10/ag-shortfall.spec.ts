// @coverage @scenario(AG-4) @req(R3.1) @req(R7) @constraint(preceptor_capacity)
/**
 * AG-4 — Under-supplied world: the generator must place what it can WITHOUT
 * breaking capacity, and the validator must report the shortfall honestly.
 *
 * World: a clerkship needing 3 days, a single preceptor available on only 2 days
 * with per-day capacity 1, and 2 onboarded students competing. No complete schedule
 * exists. Driven through the real Generate dialog, then asserted:
 *   - at most 2 clinical days total are placed (capacity 1 × 2 days);
 *   - no date holds more than one student for that preceptor (no over-capacity);
 *   - the validator reports no false preceptor_capacity conflict;
 *   - the results page reads incomplete with unmet requirements.
 */

import { test, expect, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { buildWorld } from '../../worlds/world-builder';
import { shortfallWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('AG-4 shortfall', { tag: ['@stage2', '@long'] }, () => {
	test('places within capacity and reports the shortfall', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, shortfallWorld());
		sandbox.register(world.sandbox);

		const gen = new GeneratePage(asAdmin);
		await gen.generate('full');

		const rows = await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId);
		const clinical = rows.filter((r) => r.kind === 'clinical');

		// Capacity 1 on each of 2 available days → at most 2 placements, ever.
		expect(clinical.length).toBeLessThanOrEqual(2);

		// No date holds more than one student for the single preceptor.
		const byDate = new Map<string, number>();
		for (const r of clinical) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
		for (const [, n] of byDate) expect(n).toBeLessThanOrEqual(1);

		// Each student is capped at 2 (can never reach the required 3 here).
		for (const name of ['Student 1', 'Student 2']) {
			const sid = world.ids.student[name];
			expect(clinical.filter((r) => r.student_id === sid).length).toBeLessThanOrEqual(2);
		}

		// The engine respected capacity, so there is no over-capacity conflict.
		const v = await readValidation(asAdmin);
		expect(countOf(v, 'preceptor_capacity')).toBe(0);

		// The results page is honest about the shortfall.
		await gen.gotoResults();
		expect(await gen.resultsComplete()).toBe(false);
		await expect(gen.resultsUnmet()).toBeVisible();
	});
});
