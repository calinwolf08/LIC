// @coverage @req(R6.6)
/**
 * J3.6 — Swapping two assignments' preceptors (e2e plan Phase 3).
 *
 * FINDING (P3-e): the swap operation has a working API
 * (`POST /api/schedules/assignments/swap`) and service, but no UI surface in the
 * app — no calendar/list/dialog affordance reaches it. This journey therefore
 * drives the route directly to prove the round-trip is sound; the missing UI is
 * recorded in the Phase 3 findings.
 *
 * Two students each have a clean Pediatrics day with a different preceptor at the
 * shared Community Hospital site; a swap exchanges their preceptors and nothing
 * else. Runs in a populated sandbox.
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule } from '../../fixtures';
import { populatedSandbox } from './helpers';

const CLERKSHIP = 'Pediatrics';
const SITE = 'Community Hospital';
const PRECEPTOR_A = 'Dr. Sarah Wilson';
const PRECEPTOR_B = 'Dr. Michael Lee';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.6 manual scheduling — swap', { tag: ['@stage1'] }, () => {
	test('the swap route exchanges two assignments’ preceptors (no UI surface exists)', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.6 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const bob = roster.students.find((s) => s.name === 'Bob Williams')!;
		const clerkshipId = roster.clerkships.find((c) => c.name === CLERKSHIP)!.id;
		const siteId = roster.sites.find((s) => s.name === SITE)!.id;
		const sarahId = roster.preceptors.find((p) => p.name === PRECEPTOR_A)!.id;
		const michaelId = roster.preceptors.find((p) => p.name === PRECEPTOR_B)!.id;

		// The DB enforces a global UNIQUE(student_id, date), so each student's day
		// must be free of ANY existing assignment (including the seeded Demo
		// schedule). Pick, per student, the first future weekday they do not use.
		const usedDates = async (studentId: string) => {
			const rows = await db
				.selectFrom('schedule_assignments')
				.select('date')
				.where('student_id', '=', studentId)
				.execute();
			return new Set(rows.map((r) => r.date));
		};
		const firstFreeWeekday = (used: Set<string>, from: number) => {
			let n = from;
			for (;;) {
				const d = fromToday(n);
				const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
				if (dow !== 0 && dow !== 6 && !used.has(d)) return d;
				n++;
			}
		};
		const dayA = firstFreeWeekday(await usedDates(alice.id), 8);
		const dayB = firstFreeWeekday(await usedDates(bob.id), 8);

		// Two clean Pediatrics days (one per student) with different preceptors.
		const createFor = (studentId: string, preceptorId: string, date: string) =>
			api.post('/api/schedules/assignments', {
				student_id: studentId,
				preceptor_id: preceptorId,
				clerkship_id: clerkshipId,
				site_id: siteId,
				date
			});
		const c1 = await createFor(alice.id, sarahId, dayA);
		const c2 = await createFor(bob.id, michaelId, dayB);
		expect(
			c1.ok && c2.ok,
			`creates: c1=${c1.status} ${JSON.stringify(c1.error ?? c1.data)} | c2=${c2.status} ${JSON.stringify(c2.error ?? c2.data)}`
		).toBe(true);

		let rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const aliceRow = rows.find((r) => r.student_id === alice.id)!;
		const bobRow = rows.find((r) => r.student_id === bob.id)!;
		expect(aliceRow.preceptor_id).toBe(sarahId);
		expect(bobRow.preceptor_id).toBe(michaelId);

		// Swap their preceptors through the route.
		const swap = await api.post('/api/schedules/assignments/swap', {
			assignment_id_1: aliceRow.id,
			assignment_id_2: bobRow.id
		});
		expect(swap.ok, `swap failed: ${JSON.stringify(swap.error ?? swap.data)}`).toBe(true);

		// Each assignment now carries the other's preceptor; students/dates unchanged.
		rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const aliceAfter = rows.find((r) => r.id === aliceRow.id)!;
		const bobAfter = rows.find((r) => r.id === bobRow.id)!;
		expect(aliceAfter.preceptor_id).toBe(michaelId);
		expect(bobAfter.preceptor_id).toBe(sarahId);
		expect(aliceAfter.student_id).toBe(alice.id);
		expect(bobAfter.student_id).toBe(bob.id);
		expect(aliceAfter.date).toBe(dayA);
		expect(bobAfter.date).toBe(dayB);
	});
});
