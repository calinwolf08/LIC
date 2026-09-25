// @coverage @finding(CF-H6) @req(R3.2)
/**
 * CF-H6 — Full availability calendar to plan against, plus notes.
 *
 * Client feedback: "Full availability calendar to plan against + notes." The
 * calendar view already exists; this covers the notes half — a free-text note on
 * an availability pattern is carried onto the materialised days and surfaced on
 * the preceptor's availability calendar, so the coordinator sees, per day, why a
 * day is (un)available ("mornings only", "out for conference").
 *
 * The journey adds a Weekly pattern with a note through the real builder, saves,
 * then asserts the note both on the read model (API) and on the calendar (a note
 * marker on a materialised day).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { populatedSandbox } from '../phase-3/helpers';

interface CalendarDay {
	date: string;
	availabilityNote?: string;
}
interface PreceptorSchedule {
	calendar: Array<{ weeks: Array<{ days: CalendarDay[] }> }>;
}

test.describe('CF-H6 availability notes', { tag: ['@stage1'] }, () => {
	test('a pattern note is carried onto the days and shown on the availability calendar', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `CF-H6 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const site = roster.sites[0];
		const stamp = Date.now();
		const created = await api.post<{ id?: string; preceptor?: { id: string } }>('/api/preceptors', {
			name: `Dr. Notes ${stamp}`,
			email: `notes_${stamp}@example.com`,
			health_system_id: site.health_system_id ?? undefined,
			site_ids: [site.id],
			max_students: 1
		});
		expect(created.ok).toBe(true);
		const precId = created.data?.preceptor?.id ?? created.data?.id;
		expect(precId).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'preceptors',
			entityIds: [precId]
		});

		const noteText = `Mornings only ${stamp}`;

		// Add a default Weekly (Mon–Fri) available pattern carrying a note.
		await asAdmin.goto(`/preceptors/${precId}?tab=availability`);
		await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
		await asAdmin.locator('#start-date').fill(fromToday(3));
		await asAdmin.locator('#end-date').fill(fromToday(17));
		await asAdmin.locator('#reason').fill(noteText);
		await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();
		await asAdmin.getByRole('button', { name: /save availability|save \d+ availability/i }).click();

		// The read model carries the note onto at least one materialised day.
		await expect
			.poll(
				async () => {
					const schedule = (await api.get<PreceptorSchedule>(`/api/preceptors/${precId}/schedule`))
						.data;
					const days = (schedule?.calendar ?? []).flatMap((m) =>
						m.weeks.flatMap((w) => w.days)
					);
					return days.filter((d) => d.availabilityNote === noteText).length;
				},
				{ timeout: 15000 }
			)
			.toBeGreaterThanOrEqual(1);

		// And the calendar renders a note marker on a materialised day.
		await asAdmin.goto(`/preceptors/${precId}?tab=availability`);
		const marker = asAdmin.locator('[data-testid^="cal-note-"]').first();
		await expect(marker).toBeVisible({ timeout: 15000 });
		await expect(marker).toHaveAttribute('title', noteText);
	});
});
