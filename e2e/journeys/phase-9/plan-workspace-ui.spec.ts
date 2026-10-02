// @coverage @finding(CF-PLAN-UI) @req(R6.1) @req(R6.2)
/**
 * CF-PLAN-UI — the manual planner workspace (L4 #3) renders and the add-pin round
 * trip works end to end through the real UI: a clean pin shows OK with zero
 * conflicts, and a second clashing pin makes the live conflict panel light up
 * without anything being written to the real schedule.
 *
 * The deeper combinatorial planning flow (override, carry-forward, commit) is the
 * MP-4 mega-journey; this is the wiring smoke for the new surface.
 */

import { test, expect } from '../../fixtures';
import { buildWorld } from '../../worlds/world-builder';
import { manualWorld } from '../../worlds/catalog';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('CF-PLAN-UI manual planner workspace', { tag: ['@stage2', '@long'] }, () => {
	test('stage a clean pin, then a clashing pin lights up the conflict panel', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, manualWorld());
		sandbox.register(world.sandbox);
		const fm = world.labels.clerkship['Family Medicine'];
		const clinic = world.labels.site['Clinic'];

		const rows = () => asAdmin.locator('li[data-testid^="plan-pin-"]');
		const addPin = async (date: string) => {
			await asAdmin.getByTestId('plan-student').selectOption({ label: 'Student 1' });
			await asAdmin.getByTestId('plan-clerkship').selectOption({ label: fm });
			await asAdmin.getByTestId('plan-preceptor').selectOption({ label: 'Dr. FM' });
			await asAdmin.getByTestId('plan-site').selectOption({ label: clinic });
			await asAdmin.getByTestId('plan-date').fill(date);
			await asAdmin.getByTestId('plan-add').click();
		};

		await asAdmin.goto('/plan');
		await expect(asAdmin.getByTestId('plan-workspace')).toBeVisible();
		await expect(asAdmin.getByTestId('plan-empty')).toBeVisible();

		// --- A clean pin: one row, no conflicts, status OK ---
		await addPin(world.anchor);
		await expect(rows()).toHaveCount(1);
		await expect(asAdmin.getByTestId('plan-conflict-count')).toHaveText('0');

		// --- A second full-day pin on the same student-date: session clash ---
		await addPin(world.anchor);
		await expect(rows()).toHaveCount(2);
		await expect(asAdmin.getByTestId('plan-conflict-count')).not.toHaveText('0');
		await expect(asAdmin.getByTestId('plan-conflict-session_clash')).toBeVisible();

		// --- Override acceptance: both clashing pins go from "to resolve" to OK ---
		const pinIds = await rows().evaluateAll((els) =>
			els.map((e) => e.getAttribute('data-testid')!.replace('plan-pin-', ''))
		);
		for (const id of pinIds) {
			await expect(asAdmin.getByTestId(`plan-pin-status-${id}`)).toHaveText(/to resolve/i);
			await asAdmin.getByTestId(`plan-pin-accept-${id}-session_clash`).click();
			await expect(asAdmin.getByTestId(`plan-pin-status-${id}`)).toHaveText('OK');
		}

		// Nothing was written to the real schedule — the planner is a draft layer.
		const committed = await (db as Kysely<DB>)
			.selectFrom('schedule_assignments')
			.select('id')
			.where('schedule_id', '=', world.scheduleId)
			.execute();
		expect(committed).toHaveLength(0);

		// --- Clearing the plan empties it ---
		await asAdmin.getByTestId('plan-clear').click();
		await expect(asAdmin.getByTestId('plan-empty')).toBeVisible();
	});
});
