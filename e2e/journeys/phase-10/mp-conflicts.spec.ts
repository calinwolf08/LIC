// @coverage @scenario(MP-6) @req(R6.1) @req(R7) @finding(CF-L1) @finding(CF-L2) @finding(CF-L3)
// @coverage @constraint(not_onboarded) @constraint(preceptor_unavailable) @constraint(site_not_allowed)
// @coverage @constraint(preceptor_capacity) @constraint(block_week_conflict) @constraint(blackout_date)
/**
 * MP-6 — Planner conflict matrix (unhappy path). One hand-built plan trips every
 * conflict the planner dry-run can surface, each on its own pin, and the coordinator
 * works through them:
 *
 *   - not_onboarded        — a student with no onboarding.
 *   - preceptor_unavailable — a preceptor marked off that day.
 *   - site_not_allowed     — a site the clerkship doesn't allow.
 *   - preceptor_capacity   — two students on a capacity-1 preceptor-day.
 *   - block_week_conflict  — a scattered day inside an inpatient block week.
 *
 * Every conflict surfaces in the panel and marks its pin "to resolve". The
 * coordinator accepts the overrides (all committable), then resets one and removes
 * another before committing: the committable pins persist (overrides recorded), the
 * reset pin is skipped and kept in the draft, and the committed-schedule validator
 * shows exactly the conflicts that actually committed — no trace of the skipped or
 * removed ones.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { plannerConflictWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-6 planner conflict matrix', { tag: ['@stage2', '@long'] }, () => {
	test('every conflict surfaces, is overridable, and commit honors resolve/remove', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(300000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, plannerConflictWorld());
		sandbox.register(world.sandbox);

		const fm = world.labels.clerkship['Family Medicine'];
		const inpatient = world.labels.clerkship['Inpatient'];
		const clinic = world.labels.site['Clinic'];
		const annex = world.labels.site['Annex'];
		const drBusy = world.ids.preceptor['Dr. Busy'];

		const dayBlockMon = world.anchor;
		const dayBlockWed = addDays(world.anchor, 2);
		const dayNotOnb = addDays(world.anchor, 7);
		const dayAnnex = addDays(world.anchor, 8);
		const dayCap = addDays(world.anchor, 9);
		const dayUnavail = addDays(world.anchor, 21);
		const dayBlackout = addDays(world.anchor, 28); // world seeds a blackout here

		// Mark Dr. Busy explicitly OFF on the unavailable day. The world seeds an
		// available row there, so flip it rather than inserting a duplicate.
		await kysely
			.updateTable('preceptor_availability')
			.set({ is_available: 0 })
			.where('preceptor_id', '=', drBusy)
			.where('date', '=', dayUnavail)
			.execute();

		const plan = new PlanPage(asAdmin);
		await plan.goto();

		// --- Build the conflict matrix (order defines pin ids) ---
		await plan.addPin({ student: 'Unonboarded', clerkship: fm, preceptor: 'Dr. Cap', site: clinic, date: dayNotOnb });
		await plan.addPin({ student: 'Student 2', clerkship: fm, preceptor: 'Dr. Busy', site: clinic, date: dayUnavail });
		await plan.addPin({ student: 'Student 2', clerkship: fm, preceptor: 'Dr. Cap', site: annex, date: dayAnnex });
		await plan.addPin({ student: 'Student 1', clerkship: fm, preceptor: 'Dr. Cap', site: clinic, date: dayCap });
		await plan.addPin({ student: 'Student 2', clerkship: fm, preceptor: 'Dr. Cap', site: clinic, date: dayCap });
		await plan.addPin({ student: 'Student 1', clerkship: inpatient, preceptor: 'Dr. Block', site: clinic, date: dayBlockMon });
		await plan.addPin({ student: 'Student 1', clerkship: fm, preceptor: 'Dr. Cap', site: clinic, date: dayBlockWed });

		const ids = await plan.pinIds();
		expect(ids).toHaveLength(7);

		// --- Every conflict type is surfaced in the panel ---
		for (const code of [
			'not_onboarded',
			'preceptor_unavailable',
			'site_not_allowed',
			'preceptor_capacity',
			'block_week_conflict'
		]) {
			await expect(plan.conflictRow(code), `${code} surfaced`).toBeVisible();
		}

		// blackout_date: add a pin on the blackout day, confirm it surfaces, then drop it
		// (keeps the commit math below on the seven matrix pins).
		await plan.addPin({ student: 'Student 1', clerkship: fm, preceptor: 'Dr. Cap', site: clinic, date: dayBlackout });
		const blackoutId = (await plan.pinIds())[7];
		await expect(plan.conflictRow('blackout_date')).toBeVisible();
		await expect(plan.status(blackoutId)).toHaveText(/to resolve/i);
		await plan.removePin(blackoutId);
		await expect(plan.conflictRow('blackout_date')).toHaveCount(0);

		// The clean inpatient block pin (#6) is OK; the rest are "to resolve".
		await expect(plan.status(ids[5])).toHaveText('OK');
		for (const i of [0, 1, 2, 3, 4, 6]) {
			await expect(plan.status(ids[i]), `pin ${i} to resolve`).toHaveText(/to resolve/i);
		}

		// --- Accept each override; every pin becomes committable ---
		await plan.acceptCode(ids[0], 'not_onboarded');
		await plan.acceptCode(ids[1], 'preceptor_unavailable');
		await plan.acceptCode(ids[2], 'site_not_allowed');
		await plan.acceptCode(ids[3], 'preceptor_capacity');
		await plan.acceptCode(ids[4], 'preceptor_capacity');
		await plan.acceptCode(ids[6], 'block_week_conflict');
		await expect(plan.commitButton()).toHaveText(/Commit 7 assignments/);

		// --- Change of mind: reset one (back to blocking) and remove another ---
		await plan.resetOverrides(ids[0]); // not_onboarded pin → to resolve again
		await expect(plan.status(ids[0])).toHaveText(/to resolve/i);
		await plan.removePin(ids[2]); // drop the site_not_allowed pin
		await expect(plan.conflictRow('site_not_allowed')).toHaveCount(0);
		await expect(plan.commitButton()).toHaveText(/Commit 5 assignments/);

		// --- Commit: 5 persist, the reset pin is skipped and kept ---
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 5 assignments/);
		await expect(plan.commitResult()).toContainText(/1 pin/);
		await expect(plan.rows()).toHaveCount(1);

		// --- The committed schedule reflects exactly what committed ---
		const v = await readValidation(asAdmin);
		expect(countOf(v, 'preceptor_capacity'), 'capacity persisted').toBeGreaterThan(0);
		expect(countOf(v, 'block_week_conflict'), 'block-week persisted').toBeGreaterThan(0);
		expect(countOf(v, 'preceptor_unavailable'), 'unavailable persisted').toBeGreaterThan(0);
		expect(countOf(v, 'not_onboarded'), 'skipped pin left no trace').toBe(0);
		expect(countOf(v, 'site_not_allowed'), 'removed pin left no trace').toBe(0);
	});
});
