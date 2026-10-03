// @coverage @scenario(MP-5) @req(R6.1) @req(R6.2) @req(R6.3) @finding(CF-M2) @finding(CF-M3)
/**
 * MP-5 — Planner build modes, half-days and non-clinical days (happy path), all the
 * way to a clean commit. Exercises every add-form affordance the planner offers:
 *
 *   - the Add button is disabled until the form is valid (gating);
 *   - the date field cannot be set before today (past-date floor);
 *   - RANGE mode with weekday chips toggled off stages exactly the chosen weekdays;
 *   - INDIVIDUAL single-date adds;
 *   - AM + PM half-days on one date are clean (no session clash);
 *   - FREE DAY and EXAM pins hide the clinical pickers and render distinctly;
 *   - removing a pin drops it;
 *   - committing a clean plan persists everything and leaves a conflict-free schedule.
 */

import { test, expect } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { manualWorld } from '../../worlds/catalog';
import { readValidation, totalViolations } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-5 planner build modes', { tag: ['@stage2', '@long'] }, () => {
	test('range + individual + half-days + non-clinical, then a clean commit', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, manualWorld());
		sandbox.register(world.sandbox);
		const fm = world.labels.clerkship['Family Medicine'];
		const clinic = world.labels.site['Clinic'];
		const clinical = { student: 'Student 1', clerkship: fm, preceptor: 'Dr. FM', site: clinic };
		const plan = new PlanPage(asAdmin);

		await plan.goto();
		await expect(asAdmin.getByTestId('plan-empty')).toBeVisible();

		// --- Gating: Add is disabled with an empty form ---
		await expect(plan.addButton()).toBeDisabled();

		// --- Past-date floor: the date field cannot go before today ---
		const today = new Date().toISOString().slice(0, 10);
		await asAdmin.getByTestId('plan-mode-single').click();
		const min = await plan.dateInput().getAttribute('min');
		expect(min).toBeTruthy();
		expect(new Date(`${min}T00:00:00Z`).getTime()).toBeGreaterThanOrEqual(
			new Date(`${today}T00:00:00Z`).getTime()
		);

		// --- Range mode: Mon–Fri of week 1 with Tue + Thu toggled off → Mon/Wed/Fri ---
		const made = await plan.addRange(clinical, world.anchor, addDays(world.anchor, 4), [2, 4]);
		expect(made).toBe(3);
		await expect(plan.rows()).toHaveCount(3);
		await expect(plan.conflictCount()).toHaveText('0');

		// --- Individual single add ---
		await plan.addPin({ ...clinical, date: addDays(world.anchor, 7) });
		await expect(plan.conflictCount()).toHaveText('0');

		// --- AM + PM half-days on one date: clean, no session clash ---
		await plan.addPin({ ...clinical, session: 'am', date: addDays(world.anchor, 8) });
		await plan.addPin({ ...clinical, session: 'pm', date: addDays(world.anchor, 8) });
		await expect(plan.conflictCount()).toHaveText('0');
		expect(await plan.rows().count()).toBe(6);

		// --- Non-clinical: a free day hides the clinical pickers and renders distinctly ---
		await asAdmin.getByTestId('plan-student').selectOption({ label: 'Student 1' });
		await asAdmin.getByTestId('plan-kind').selectOption('free_day');
		await expect(asAdmin.getByTestId('plan-clerkship')).toHaveCount(0);
		await expect(asAdmin.getByTestId('plan-preceptor')).toHaveCount(0);
		await plan.addPin({ student: 'Student 1', kind: 'free_day', date: addDays(world.anchor, 9) });
		await plan.addPin({ student: 'Student 1', kind: 'exam', date: addDays(world.anchor, 10) });
		await expect(asAdmin.getByTestId('plan-pins').getByText('Free day')).toBeVisible();
		await expect(asAdmin.getByTestId('plan-pins').getByText('Exam')).toBeVisible();
		await expect(plan.conflictCount()).toHaveText('0');

		// --- Remove one pin ---
		const ids = await plan.pinIds();
		expect(ids).toHaveLength(8);
		await plan.removePin(ids[ids.length - 1]); // drop the exam pin
		await expect(plan.rows()).toHaveCount(7);

		// --- Commit the clean plan ---
		await expect(plan.commitButton()).toHaveText(/Commit 7 assignments/);
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 7 assignments/);
		await expect(plan.commitResult()).toContainText(/plan is clear/);
		await expect(asAdmin.getByTestId('plan-empty')).toBeVisible();

		// The committed schedule is conflict-free, and holds the 7 committed days.
		expect(totalViolations(await readValidation(asAdmin))).toBe(0);
		const rows = await kysely
			.selectFrom('schedule_assignments')
			.select('id')
			.where('schedule_id', '=', world.scheduleId)
			.execute();
		expect(rows).toHaveLength(7);
	});
});
