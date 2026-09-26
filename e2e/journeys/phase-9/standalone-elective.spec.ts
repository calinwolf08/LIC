// @coverage @finding(CF-E3) @req(R4.4)
/**
 * CF-E3 — Standalone electives (no parent clerkship): an elective can exist on its
 * own, its days count toward the elective only, and never toward any clerkship
 * total.
 *
 * The journey creates a standalone elective, assigns a student a day in it through
 * the real API (no clerkship_id), and asserts: the day persists with a null
 * clerkship_id and the elective_id, the student page surfaces it under "Standalone
 * electives", and no clerkship total is affected.
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('CF-E3 standalone electives', { tag: ['@stage1'] }, () => {
	test('a standalone-elective day counts to the elective only, never a clerkship', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-E3 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const site = roster.sites[0];

		// A dedicated student so this test never collides with the shared roster.
		const stamp = Date.now();
		const stuRes = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `E3 Student ${stamp}`,
				email: `e3_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = stuRes?.student?.id ?? stuRes?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		// A standalone elective (no parent clerkship), minimum 2 days.
		const electiveId = crypto.randomUUID();
		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_electives')
			.values({
				id: electiveId,
				clerkship_id: null,
				name: `Global Health ${Date.now()}`,
				minimum_days: 2,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		// Assign Alice one day in it — no clerkship_id on the request.
		const day = futureWeekday(8);
		const created = await api.post('/api/schedules/assignments', {
			student_id: sid,
			preceptor_id: amanda.id,
			site_id: site.id,
			elective_id: electiveId,
			date: day,
			force: true
		});
		expect(created.ok).toBe(true);

		// DB: the row has a null clerkship_id and carries the elective.
		const rows = await assignmentsForSchedule(kysely, roster.sandbox.id);
		const row = rows.find((r) => r.date === day && r.elective_id === electiveId);
		expect(row, 'the standalone-elective day was created').toBeTruthy();
		expect(row!.clerkship_id).toBeNull();

		// The student page surfaces it under Standalone electives, and no clerkship
		// total is affected (overall completed/scheduled stay 0).
		await asAdmin.goto(`/students/${sid}`);
		const section = asAdmin.getByTestId('standalone-electives');
		await expect(section).toBeVisible({ timeout: 15000 });
		await expect(section.getByTestId(`standalone-elective-${electiveId}`)).toContainText(
			/scheduled .* \/ 2/
		);
		// No clerkship counted the standalone day.
		await expect(asAdmin.getByTestId('overall-scheduled')).toHaveText('0');
	});
});
