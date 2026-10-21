// @coverage @finding(CF-PLAN-UI) @req(R6.1) @req(R6.2)
/**
 * CF-PLAN-UI — the manual planner workspace (L4 #3) renders and the add-pin round
 * trip works end to end through the real UI: a clean pin shows OK with zero
 * conflicts; the same student-date again is filtered out, and staging it with an
 * override makes the live conflict panel light up, without anything being written
 * to the real schedule.
 *
 * The deeper combinatorial planning flow (override, carry-forward, commit) is the
 * MP-4 mega-journey; this is the wiring smoke for the new surface.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
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

		const plan = new PlanPage(asAdmin);
		const pin = { student: 'Student 1', clerkship: fm, preceptor: 'Dr. FM', site: clinic };

		await plan.goto();
		await expect(asAdmin.getByTestId('plan-empty')).toBeVisible();

		// --- A clean pin: one row, no conflicts, status OK ---
		await plan.addPin({ ...pin, date: world.anchor });
		await expect(plan.rows()).toHaveCount(1);
		await expect(plan.conflictCount()).toHaveText('0');

		// --- The same student-date again is filtered out: the student is booked ---
		await plan.pick('plan-student', 'Student 1');
		await plan.pickDays([world.anchor]);
		await expect(asAdmin.getByTestId('plan-days-summary')).toContainText(/already booked/);
		await expect(plan.addButton()).toBeDisabled();

		// --- Staged anyway with an override: the clash lights up the conflict panel ---
		await plan.addPin({ ...pin, date: world.anchor }, { override: true });
		await expect(plan.rows()).toHaveCount(2);
		await expect(plan.conflictCount()).not.toHaveText('0');
		await expect(plan.conflictRow('session_clash')).toBeVisible();

		// The overridden pin carries its accepted clash; the first pin still has to
		// accept it before both are committable.
		const [first, second] = await plan.pinIds();
		await expect(plan.overridden(second)).toBeVisible();
		await expect(plan.status(second)).toHaveText('OK');
		await expect(plan.status(first)).toHaveText(/to resolve/i);
		await plan.acceptCode(first, 'session_clash');

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
