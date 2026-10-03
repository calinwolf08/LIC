// @coverage @finding(CF-PLAN-PARITY) @req(R6.1) @constraint(over_required_days)
/**
 * CF-PLAN-PARITY — the planner preview reflects the create-time codes that only the
 * commit path enforces, so what the panel shows is what will actually commit.
 *
 * `over_required_days` is the reachable case: the whole-schedule dry-run omits it
 * (that evaluator must not flood the dashboard with it), but commit refuses to
 * over-fill a clerkship. The planner recomputes it for the draft, so a pin past the
 * requirement reads "to resolve" (not a falsely-green "OK") and the Commit button's
 * count matches exactly how many pins will persist.
 *
 * (`past_date`, the other create-time code, is prevented up front by the date field's
 * today floor and covered at the service level.)
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays, type WorldSpec } from '../../worlds/world-builder';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

/** One student, one preceptor, a clerkship that needs only 2 days. */
function lowRequirementWorld(): WorldSpec {
	return {
		name: 'Preview parity',
		healthSystems: ['Metro'],
		sites: [{ name: 'Clinic', healthSystem: 'Metro' }],
		clerkships: [
			{ name: 'Family Medicine', type: 'outpatient', requiredDays: 2, sites: ['Clinic'] }
		],
		preceptors: [
			{
				name: 'Dr. FM',
				sites: ['Clinic'],
				teaches: ['Family Medicine'],
				availability: [0, 1, 2, 3, 4].map((day) => ({ day, site: 'Clinic', session: 'full' as const }))
			}
		],
		students: [{ name: 'Student 1', onboardedAt: ['Metro'] }]
	};
}

test.describe('CF-PLAN-PARITY preview matches commit', { tag: ['@stage2', '@long'] }, () => {
	test('over_required_days surfaces in the preview and gates the commit count', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, lowRequirementWorld());
		sandbox.register(world.sandbox);
		const fm = world.labels.clerkship['Family Medicine'];
		const clinic = world.labels.site['Clinic'];
		const pin = { student: 'Student 1', clerkship: fm, preceptor: 'Dr. FM', site: clinic };
		const plan = new PlanPage(asAdmin);

		await plan.goto();

		// Stage 3 days for a clerkship that requires only 2.
		await plan.addPin({ ...pin, date: world.anchor });
		await plan.addPin({ ...pin, date: addDays(world.anchor, 1) });
		await plan.addPin({ ...pin, date: addDays(world.anchor, 2) });
		const ids = await plan.pinIds();

		// The preview flags the 3rd pin (over the requirement) — not a false "OK".
		await expect(plan.conflictRow('over_required_days')).toBeVisible();
		await expect(plan.status(ids[2])).toHaveText(/to resolve/i);
		// …and the Commit button offers exactly the 2 pins that would actually commit.
		await expect(plan.commitButton()).toHaveText(/Commit 2 assignments/);

		// Accepting the override makes the 3rd committable, matching commit.
		await plan.acceptCode(ids[2], 'over_required_days');
		await expect(plan.commitButton()).toHaveText(/Commit 3 assignments/);

		// Commit persists all three (the override is honored end to end).
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 3 assignments/);
		const rows = await kysely
			.selectFrom('schedule_assignments')
			.select('id')
			.where('schedule_id', '=', world.scheduleId)
			.execute();
		expect(rows).toHaveLength(3);
	});
});
