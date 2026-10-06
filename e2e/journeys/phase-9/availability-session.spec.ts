// @coverage @finding(CF-L1) @req(R7)
/**
 * CF-L1 (availability side) — a half-day availability slot defaults the assignment.
 *
 * When a preceptor's availability for a day is a morning (AM) slot worth half a
 * day, opening the assignment dialog on that day prefills the session to Morning
 * and the credit to 0.5 — overridable, but so the coordinator doesn't re-enter it.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';
import { AssignmentDialog, CalendarPage } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return d;
		n++;
	}
}

test.describe('CF-L1 availability half-day slot prefills the dialog', { tag: ['@stage1'] }, () => {
	test('an AM availability slot defaults the assignment to Morning at 0.5 credit', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-L1-avail ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `L1A Student ${stamp}`,
				email: `l1a_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const site = roster.sites.find((s) => s.name === 'Metro General Hospital')!;
		const d = futureWeekday(12);

		// A morning (AM) availability slot worth half a day for Amanda at Metro on `d`.
		const ts = new Date().toISOString();
		await kysely
			.deleteFrom('preceptor_availability')
			.where('preceptor_id', '=', amanda.id)
			.where('date', '=', d)
			.execute();
		await kysely
			.insertInto('preceptor_availability')
			.values({
				id: crypto.randomUUID(),
				preceptor_id: amanda.id,
				site_id: site.id,
				date: d,
				is_available: 1,
				session: 'am',
				credit_value: 0.5,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`L1A Student ${stamp}`);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		await dialog.selectSite('Metro General Hospital');
		await dialog.pickDay(d);

		// The dialog prefilled session + credit from the AM availability slot.
		await expect(asAdmin.getByTestId('ad-session')).toHaveValue('am', { timeout: 15000 });
		await expect(asAdmin.getByTestId('ad-credit')).toHaveValue('0.5');
	});
});
