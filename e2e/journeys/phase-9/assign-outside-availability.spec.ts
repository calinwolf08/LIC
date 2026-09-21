// @coverage @finding(CF-I1) @req(R3.6) @req(R7.4)
/**
 * CF-I1 — Assigning a preceptor on a day outside their availability is allowed
 * (Stage 1 is permissive, R3.6) but is flagged on the preceptor page and must
 * NOT corrupt the capacity math.
 *
 * Client feedback: "Was able to assign to preceptor that had no availability …
 * the preceptor page math gets messed up because assigned outside of
 * availability." Utilization used to exceed 100% (or read 0% when there were no
 * available days) and open slots went wrong. This journey assigns a seeded
 * preceptor on a Saturday (outside her weekday availability) and asserts, at
 * both the UI and the API layer, that the day is flagged and the numbers stay
 * sane (utilization within 0–100, open slots never negative).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

function nextWeekday(from: number, dow: number): string {
	let n = from;
	while (new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay() !== dow) n++;
	return fromToday(n);
}

interface Capacity {
	availableDays: number;
	assignedDays: number;
	assignedOutsideAvailability: number;
	openSlots: number;
	utilizationPercent: number;
}

test.describe(
	'CF-I1 out-of-availability assignment is flagged, math stays sane',
	{
		tag: ['@stage1']
	},
	() => {
		test('assigning on a non-available day flags the preceptor and keeps utilization ≤ 100%', async ({
			asAdmin,
			sandbox
		}) => {
			test.setTimeout(180000);
			const roster = await populatedSandbox(asAdmin, `CF-I1 ${Date.now()}`);
			sandbox.register(roster.sandbox);
			const api = apiOf(asAdmin);

			const preceptor = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
			const student = roster.students.find((s) => s.name === 'Alice Johnson')!;
			const saturday = nextWeekday(8, 6); // outside her weekday availability

			// --- Assign on the Saturday through the real dialog (accept any soft override) ---
			await asAdmin.goto(`/students/${student.id}`);
			const dialog = new AssignmentDialog(asAdmin);
			await dialog.open();
			await dialog.selectClerkship('Family Medicine');
			await dialog.selectPreceptor('Dr. Amanda Smith');
			await dialog.pickDay(saturday);
			await dialog.submitAndExpectCreated();

			// --- The preceptor page flags the out-of-availability day ---
			await asAdmin.goto(`/preceptors/${preceptor.id}`);
			await expect(asAdmin.getByTestId('assigned-outside-availability')).toBeVisible({
				timeout: 15000
			});

			// --- The math is sane at the API layer (authoritative) ---
			const cap = (
				await api.get<{ overallCapacity: Capacity }>(`/api/preceptors/${preceptor.id}/schedule`)
			).data!.overallCapacity;
			expect(cap.assignedOutsideAvailability).toBeGreaterThanOrEqual(1);
			expect(cap.utilizationPercent).toBeGreaterThanOrEqual(0);
			expect(cap.utilizationPercent).toBeLessThanOrEqual(100);
			expect(cap.openSlots).toBeGreaterThanOrEqual(0);
		});
	}
);
