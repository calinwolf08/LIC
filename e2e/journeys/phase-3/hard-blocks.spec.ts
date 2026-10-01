// @coverage @constraint(entity_missing)
// @coverage @req(R7.1) @req(R7.2)
/**
 * J3.4 — Hard blocks never pass (e2e plan Phase 3).
 *
 * Since L1, a same-day second assignment is NOT a hard block — it is an
 * overridable, credit-aware over-book (covered by CF-L1). The one remaining hard
 * block is a missing entity: the API refuses it even when the (non-overridable)
 * hard code is forced, and nothing is written. This spec guards that invariant.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const CLERKSHIP = 'Family Medicine';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.4 manual scheduling — hard blocks', { tag: ['@stage1'] }, () => {
	test('a missing entity is a hard block the API refuses, writing nothing', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J3.4 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;
		const clerkshipId = roster.clerkships.find((c) => c.name === CLERKSHIP)!.id;
		const day = futureWeekday(8);

		const before = await api.get<unknown[]>(`/api/students/${studentId}/schedule`);
		const beforeCount = (before.data ?? []).length;

		// A non-existent preceptor is a hard `entity_missing` block. Forcing the hard
		// code cannot bypass it (hard codes are never overridable), so the create is
		// refused and the student's row count does not change.
		const forced = await api.post('/api/schedules/assignments', {
			student_id: studentId,
			preceptor_id: 'does-not-exist',
			clerkship_id: clerkshipId,
			date: day,
			override_codes: ['entity_missing']
		});
		expect(forced.ok).toBe(false);
		expect(forced.status).toBeGreaterThanOrEqual(400);

		const after = await api.get<unknown[]>(`/api/students/${studentId}/schedule`);
		expect((after.data ?? []).length).toBe(beforeCount);
	});
});
