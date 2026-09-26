// @coverage @finding(CF-M1) @req(R4.4)
/**
 * CF-M1 — Credit value: a scheduled day can be worth other than one day toward a
 * requirement (a half day = 0.5, a long day > 1), and requirement tracking sums
 * credit rather than counting rows.
 *
 * Client feedback: "Not every day is a full day." The journey creates two
 * half-credit days for one student+clerkship and asserts the requirement strip
 * reads 1.0 scheduled (not 2), edits one day's credit on the fly, and asserts the
 * strip updates. It also asserts the credit field is present in the real dialog.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

/** `count` distinct future weekdays (Mon–Fri), starting at day offset `startAt`. */
function futureWeekdays(count: number, startAt: number): string[] {
	const out: string[] = [];
	let n = startAt;
	while (out.length < count) {
		const date = fromToday(n);
		const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(date);
		n++;
	}
	return out;
}

test.describe('CF-M1 credit value sums toward requirements', { tag: ['@stage1'] }, () => {
	test('two half-credit days read as 1.0, and editing credit updates the strip', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `CF-M1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		// A dedicated student so this test never collides (global UNIQUE(student,date))
		// with any other test's use of the shared seeded roster.
		const stamp = Date.now();
		const studentId = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `M1 Student ${stamp}`,
				email: `m1_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = studentId?.student?.id ?? studentId?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const site = roster.sites[0];

		// Two half-credit days in Family Medicine. force accepts the
		// availability/onboarding soft codes so the test isolates the credit math.
		const create = (date: string, credit: number) =>
			api.post<{ assignment?: { id: string } }>('/api/schedules/assignments', {
				student_id: sid,
				preceptor_id: amanda.id,
				clerkship_id: roster.clerkships.find((c) => c.name === 'Family Medicine')!.id,
				site_id: site.id,
				date,
				credit_value: credit,
				force: true
			});

		const [day1, day2] = futureWeekdays(2, 8);
		const r1 = await create(day1, 0.5);
		const r2 = await create(day2, 0.5);
		expect(r1.ok && r2.ok).toBe(true);
		const firstId = r1.data?.assignment?.id;
		expect(firstId).toBeTruthy();

		// The requirement strip sums credit: 0.5 + 0.5 = 1 scheduled, not 2 rows.
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('overall-scheduled')).toHaveText('1', { timeout: 15000 });

		// The dialog exposes a credit field.
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await expect(asAdmin.getByTestId('ad-credit')).toBeVisible();
		await dialog.cancel();

		// Edit one day's credit to 1.5 → strip sums to 2.0. force so any pre-existing
		// soft on the day (unavailable/onboarding) doesn't block the credit edit.
		const patch = await api.patch(`/api/schedules/assignments/${firstId}?force=true`, {
			credit_value: 1.5
		});
		expect(patch.ok).toBe(true);
		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId('overall-scheduled')).toHaveText('2', { timeout: 15000 });
	});
});
