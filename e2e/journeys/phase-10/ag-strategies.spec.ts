// @coverage @scenario(AG-5) @req(R3.1) @req(R5)
/**
 * AG-5 — Assignment-strategy variants produce the expected placement shape, driven
 * through the real Generate dialog.
 *
 * World: one clerkship needing 2 days, two preceptors both available on the same two
 * days, one student. The clerkship's strategy is forced per run:
 *   - continuous_single → both days land on the SAME preceptor (continuity);
 *   - daily_rotation    → the two days spread across DIFFERENT preceptors.
 * This proves the configured strategy actually drives engine placement end to end.
 */

import { test, expect, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { buildWorld } from '../../worlds/world-builder';
import { strategyWorld } from '../../worlds/catalog';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('AG-5 strategy variants', { tag: ['@stage2', '@long'] }, () => {
	test('continuous_single keeps one preceptor for the whole rotation', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, strategyWorld('continuous_single'));
		sandbox.register(world.sandbox);

		await new GeneratePage(asAdmin).generate('full');

		const rows = await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId);
		expect(rows).toHaveLength(2);
		const preceptors = new Set(rows.map((r) => r.preceptor_id));
		expect(preceptors.size, 'both days with the same preceptor').toBe(1);
	});

	test('daily_rotation spreads the days across preceptors', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, strategyWorld('daily_rotation'));
		sandbox.register(world.sandbox);

		await new GeneratePage(asAdmin).generate('full');

		const rows = await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId);
		expect(rows).toHaveLength(2);
		const preceptors = new Set(rows.map((r) => r.preceptor_id));
		expect(preceptors.size, 'days rotate across two preceptors').toBe(2);
	});
});
