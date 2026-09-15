// @coverage @req(R4.2) @req(R4.3) @req(R5.1) @req(R1.3) @finding(P8-e)
/**
 * J7.7 — Editing configuration that existing assignments depend on (e2e plan
 * Phase 7). Closes coverage doc gap #3: the app lets you change an elective's
 * minimum, re-parent a site, and shrink a schedule's window after assignments
 * already reference them. Each edit must flow through cleanly — never silently
 * drop or corrupt the dependent rows.
 *
 *   a) Elective minimum: raising a required elective's minimum re-baselines the
 *      requirement tracking a scheduled day counts against ("2 of 3" → "4 of 5").
 *      The seeded Cardiology elective is edited and restored (electives are
 *      global, shared with J3.7).
 *   b) Site re-parent: moving a site to another health system leaves the
 *      assignments on it intact (no cascade delete, site_id preserved).
 *   c) Schedule shrink: narrowing the window so an existing day falls outside it
 *      keeps the row and surfaces it as an `outside_schedule` finding rather than
 *      dropping it.
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';
import { createAssignment, freeWeekdayForStudents, futureWeekday } from '../phase-4/helpers';

interface Elective {
	id: string;
	name: string;
	minimumDays: number;
}

test.describe('J7.7 editing config under existing assignments', { tag: ['@stage1'] }, () => {
	test('a) raising an elective minimum re-baselines the requirement it is counted against', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J7.7a ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const studentId = roster.students.find((s) => s.name === 'Alice Johnson')!.id;
		const im = roster.clerkships.find((c) => c.name === 'Internal Medicine')!;

		// The seeded Cardiology elective (min 3, required).
		const electives = await api.get<Elective[]>(
			`/api/scheduling-config/electives?clerkshipId=${im.id}`
		);
		const cardio = (electives.data ?? []).find((e) => e.name === 'Cardiology')!;
		expect(cardio?.id).toBeTruthy();
		const originalMin = cardio.minimumDays;
		expect(originalMin).toBe(3);

		try {
			// Schedule one Cardiology day (clean pairing, per J3.7).
			await asAdmin.goto(`/students/${studentId}`);
			const dialog = new AssignmentDialog(asAdmin);
			await dialog.open();
			await dialog.selectClerkship('Internal Medicine');
			await dialog.selectElective('Cardiology');
			await dialog.selectPreceptor('Dr. Maria Garcia');
			await dialog.pickDay(futureWeekday(8));
			await dialog.expectClean();
			await dialog.submitAndExpectCreated();

			// Baseline: with one day scheduled against the min of 3, two remain.
			const baseline = new AssignmentDialog(asAdmin);
			await baseline.open();
			await baseline.selectClerkship('Internal Medicine');
			await baseline.selectElective('Cardiology');
			await expect(baseline.requirementStrip()).toContainText(/2 of 3\b/i);
			await baseline.cancel();

			// Raise Cardiology's minimum 3 → 5 while a day already counts against it.
			expect(
				(await api.patch(`/api/scheduling-config/electives/${cardio.id}`, { minimumDays: 5 })).ok
			).toBe(true);

			// A fresh dialog re-baselines against the NEW minimum: 1 scheduled of 5 → 4 left.
			const after = new AssignmentDialog(asAdmin);
			await after.open();
			await after.selectClerkship('Internal Medicine');
			await after.selectElective('Cardiology');
			await expect(after.requirementStrip()).toContainText(/4 of 5\b/i);
			await after.cancel();
		} finally {
			await api.patch(`/api/scheduling-config/electives/${cardio.id}`, {
				minimumDays: originalMin
			});
		}
	});

	test('b) re-parenting a site to another health system leaves its assignments intact', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J7.7b ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;

		// A clean assignment fixes the site under test.
		const avail = await api.get<Array<{ site_id: string }>>(
			`/api/preceptors/${amanda.id}/availability`
		);
		const siteId = (avail.data ?? [])[0]?.site_id;
		expect(siteId).toBeTruthy();
		const day = await freeWeekdayForStudents(db, [alice.id], 12);
		const assignmentId = await createAssignment(asAdmin, {
			student_id: alice.id,
			preceptor_id: amanda.id,
			clerkship_id: fm.id,
			site_id: siteId,
			date: day
		});

		// The site's current parent, and a different health system to move it to.
		const site = roster.sites.find((s) => s.id === siteId)!;
		const otherHs = roster.healthSystems.find((h) => h.id !== site.health_system_id);
		expect(otherHs, 'a second health system exists to re-parent to').toBeTruthy();

		const patched = await api.patch(`/api/sites/${siteId}`, {
			health_system_id: otherHs!.id
		});
		expect(patched.ok).toBe(true);

		// The site moved, and the assignment on it survived unchanged (no cascade
		// delete, site reference preserved).
		const siteAfter = await api.get<{ health_system_id: string }>(`/api/sites/${siteId}`);
		expect(siteAfter.data?.health_system_id).toBe(otherHs!.id);
		const rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const row = rows.find((r) => r.id === assignmentId);
		expect(row, 'the assignment was not dropped when its site was re-parented').toBeTruthy();
		expect(row!.site_id).toBe(siteId);
	});

	test('c) shrinking the schedule window keeps out-of-range days and flags them', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J7.7c ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const avail = await api.get<Array<{ site_id: string }>>(
			`/api/preceptors/${amanda.id}/availability`
		);
		const siteId = (avail.data ?? [])[0]?.site_id;

		// A day well into the schedule, then shrink the window to before it.
		const day = await freeWeekdayForStudents(db, [alice.id], 25);
		const assignmentId = await createAssignment(asAdmin, {
			student_id: alice.id,
			preceptor_id: amanda.id,
			clerkship_id: fm.id,
			site_id: siteId,
			date: day
		});

		const baseline = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
		const baseOutside = baseline.data?.counts?.['outside_schedule'] ?? 0;

		// Pull the end date back before the assignment day.
		const newEnd = futureWeekday(5);
		expect(newEnd < day).toBe(true);
		const patched = await api.patch(`/api/scheduling-periods/${roster.sandbox.id}`, {
			end_date: newEnd
		});
		expect(patched.ok).toBe(true);

		// The row is NOT dropped...
		const rows = await assignmentsForSchedule(db, roster.sandbox.id);
		expect(rows.some((r) => r.id === assignmentId)).toBe(true);

		// ...and the now-out-of-range day surfaces as an outside_schedule finding.
		const after = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
		expect(after.data?.counts?.['outside_schedule'] ?? 0).toBeGreaterThan(baseOutside);
	});
});
