// @coverage @scenario(AG-2) @req(R3.1) @req(R7) @constraint(not_onboarded)
/**
 * AG-2 — Per-constraint bypass through the real Generate dialog.
 *
 * World: one student who is NOT onboarded at the health system. A normal full run
 * places the day and the whole-schedule validator reports `not_onboarded` as a real
 * conflict (it recomputes raw violations and does not consult overrides). Re-running
 * with the dialog's "Student onboarding" bypass ticked places the same day but
 * stamps it as an ACCEPTED OVERRIDE, which shows up in the health panel's overrides
 * list. Proves the bypass checkbox → engine → persisted-override path end to end.
 */

import { test, expect } from '../../fixtures';
import { GeneratePage, HealthPanel } from '../../pages';
import { buildWorld } from '../../worlds/world-builder';
import { onboardingGapWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('AG-2 generation bypass', { tag: ['@stage2', '@long'] }, () => {
	test('bypassing onboarding turns a surfaced conflict into an accepted override', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, onboardingGapWorld());
		sandbox.register(world.sandbox);
		const gen = new GeneratePage(asAdmin);

		// --- Full run, no bypass → not_onboarded is a real, surfaced conflict ---
		await gen.generate('full');
		const before = await readValidation(asAdmin);
		expect(countOf(before, 'not_onboarded')).toBeGreaterThan(0);

		// --- Full run WITH the onboarding bypass → the day is stamped as an override ---
		await gen.generate('full', { bypass: ['not_onboarded'] });

		// The health panel lists it as an accepted override (the bypass took effect).
		await asAdmin.goto('/calendar');
		const health = new HealthPanel(asAdmin);
		const overrides = await health.overrideCounts();
		expect(overrides['not_onboarded'] ?? 0).toBeGreaterThan(0);
	});
});
