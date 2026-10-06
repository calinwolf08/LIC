// @coverage @scenario(AG-6) @req(R3.1) @constraint(block_week_conflict)
/**
 * AG-6 — Date-alignment matrix for the block/scatter constraint.
 *
 * The L3 pipeline bug only surfaced on a particular calendar alignment (tests build
 * dates from "today"). This re-runs the AG-1 block/scatter generation at several
 * pinned anchor Mondays so an alignment-sensitive regression fails here regardless
 * of the day the suite happens to run. Driven through the real Generate dialog.
 */

import { test, expect, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { buildWorld, addDays, mondayAtLeast } from '../../worlds/world-builder';
import { blockScatterWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

// A spread of future anchor Mondays: next week, ~3 weeks, ~5 weeks out.
const ANCHOR_OFFSETS = [7, 21, 35];

test.describe('AG-6 block/scatter date-alignment matrix', { tag: ['@stage2', '@long'] }, () => {
	for (const offset of ANCHOR_OFFSETS) {
		test(`honors L3 with anchor ${offset} days out`, async ({ asAdmin, sandbox, db }) => {
			test.setTimeout(240000);
			const anchor = mondayAtLeast(offset);
			const spec = blockScatterWorld(1);
			spec.start = anchor;
			spec.end = addDays(anchor, 55);
			const world = await buildWorld(asAdmin, db as Kysely<DB>, spec);
			sandbox.register(world.sandbox);

			await new GeneratePage(asAdmin).generate('full');

			const sid = world.ids.student['Student 1'];
			const rows = (await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId)).filter(
				(r) => r.student_id === sid
			);
			const block = rows.find((r) => r.clerkship_id === world.ids.clerkship['Inpatient Medicine']);
			const scatter = rows.find((r) => r.clerkship_id === world.ids.clerkship['Family Medicine']);
			expect(block?.date).toBe(anchor);
			expect(scatter?.date).toBe(addDays(anchor, 7)); // free week, never the block week
			expect(scatter?.date).not.toBe(addDays(anchor, 2));

			expect(countOf(await readValidation(asAdmin), 'block_week_conflict')).toBe(0);
		});
	}
});
