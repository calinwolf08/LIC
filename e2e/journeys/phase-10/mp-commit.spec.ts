// @coverage @scenario(MP-4) @req(R6.1) @req(R6.5) @finding(CF-L2) @constraint(mutual_exclusion)
/**
 * MP-4 — Plan and commit: build a multi-student plan in the Planner, override a soft
 * conflict, leave another unresolved, commit in one action, and prove the committed
 * schedule is exactly what actually committed — not what was merely staged.
 *
 * World (planWorld): two students, two mutually-exclusive preceptors (Dr. A / Dr. B)
 * sharing one clinic. Two assignments are pre-committed so each staged conflict is
 * against a real row (implicating only the one pin, not a sibling pin):
 *   - committed: Student 1 · Dr. A · dayA   (so a Student 1 pin on dayA clashes)
 *   - committed: Student 2 · Dr. A · dayA   (so a Student 2 · Dr. B pin on dayA is mutually excluded)
 *
 * Plan:
 *   1. Student 1 · Dr. B · dayB (full)  → clean.
 *   2. Student 1 · Dr. A · dayA (full)  → session_clash vs the committed row; accept it.
 *   3. Student 2 · Dr. B · dayB (full)  → clean.
 *   4. Student 2 · Dr. B · dayA (full)  → mutual_exclusion vs the committed Dr. A row; left unresolved.
 *
 * Commit: #1–#3 persist (three new rows, #2 carrying the session_clash override); #4
 * is skipped and stays in the draft. The committed-schedule validator then shows the
 * accepted session_clash but NO mutual_exclusion — the skipped pin left no trace.
 */

import { test, expect, apiOf } from '../../fixtures';
import { PlanPage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { planWorld } from '../../worlds/catalog';
import { readValidation, countOf } from '../../oracle/validation';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

test.describe('MP-4 plan and commit', { tag: ['@stage2', '@long'] }, () => {
	test('override a soft conflict, skip an unresolved one, commit the rest', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const kysely = db as Kysely<DB>;
		const world = await buildWorld(asAdmin, kysely, planWorld());
		sandbox.register(world.sandbox);
		const api = apiOf(asAdmin);
		const fm = world.labels.clerkship['Family Medicine'];
		const clinic = world.labels.site['Clinic'];
		const fmId = world.ids.clerkship['Family Medicine'];
		const clinicId = world.ids.site['Clinic'];
		const drA = world.ids.preceptor['Dr. A'];
		const drB = world.ids.preceptor['Dr. B'];
		const s1 = world.ids.student['Student 1'];
		const s2 = world.ids.student['Student 2'];
		const dayA = world.anchor;
		const dayB = addDays(world.anchor, 1);

		// Pre-commit two real rows so each staged conflict is against committed data.
		for (const studentId of [s1, s2]) {
			expect(
				(
					await api.post('/api/schedules/assignments', {
						student_id: studentId,
						preceptor_id: drA,
						clerkship_id: fmId,
						site_id: clinicId,
						date: dayA
					})
				).ok
			).toBe(true);
		}

		const plan = new PlanPage(asAdmin);
		await plan.goto();

		// --- Build the plan ---
		await plan.addPin({ student: 'Student 1', clerkship: fm, preceptor: 'Dr. B', site: clinic, date: dayB });
		await plan.addPin({ student: 'Student 1', clerkship: fm, preceptor: 'Dr. A', site: clinic, date: dayA });
		await plan.addPin({ student: 'Student 2', clerkship: fm, preceptor: 'Dr. B', site: clinic, date: dayB });
		await plan.addPin({ student: 'Student 2', clerkship: fm, preceptor: 'Dr. B', site: clinic, date: dayA });

		const ids = await plan.pinIds();
		expect(ids).toHaveLength(4);

		// The dry run surfaces both staged conflicts.
		await expect(plan.conflictRow('session_clash')).toBeVisible();
		await expect(plan.conflictRow('mutual_exclusion')).toBeVisible();

		// --- Resolve pin #2's session clash; leave pin #4's mutual exclusion ---
		await expect(plan.status(ids[1])).toHaveText(/to resolve/i);
		await plan.acceptCode(ids[1], 'session_clash');
		await expect(plan.status(ids[3])).toHaveText(/to resolve/i);
		await expect(plan.commitButton()).toHaveText(/Commit 3 assignments/);

		// --- Commit: 3 persist, 1 skipped ---
		await plan.commit();
		await expect(plan.commitResult()).toContainText(/Committed 3 assignments/);
		await expect(plan.commitResult()).toContainText(/1 pin/);

		// Three NEW rows on top of the two pre-committed ones.
		const rows = await kysely
			.selectFrom('schedule_assignments')
			.select(['student_id', 'preceptor_id', 'date', 'override_codes'])
			.where('schedule_id', '=', world.scheduleId)
			.execute();
		expect(rows).toHaveLength(5);

		// Pin #2's committed row carries the accepted session_clash override.
		const clashRow = rows.find(
			(r) => r.student_id === s1 && r.preceptor_id === drA && r.date === dayA && r.override_codes.includes('session_clash')
		);
		expect(clashRow, 'Student 1 / Dr. A / dayA committed with override').toBeTruthy();

		// Pin #4 was skipped: no Student 2 / Dr. B row exists on dayA.
		expect(rows.some((r) => r.student_id === s2 && r.preceptor_id === drB && r.date === dayA)).toBe(false);

		// The skipped pin remains in the draft.
		await expect(plan.rows()).toHaveCount(1);

		// --- The committed schedule reflects exactly what committed ---
		const v = await readValidation(asAdmin);
		expect(countOf(v, 'session_clash')).toBeGreaterThan(0); // the accepted clash persists
		expect(countOf(v, 'mutual_exclusion')).toBe(0); // the skipped mutex pin left no trace
	});
});
