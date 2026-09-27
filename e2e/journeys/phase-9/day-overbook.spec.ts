// @coverage @finding(CF-L1) @req(R7)
/**
 * CF-L1 — Half-day sessions + same-day session-clash visibility.
 *
 * Client feedback: a student may earn more than one day of credit on a date — e.g.
 * a morning of one clerkship plus an afternoon of another — so same-day booking is
 * allowed and credit is uncapped. The app flags only a true session clash (two
 * mornings, two afternoons, or a full day overlapping anything); a morning +
 * afternoon pair is fine.
 *
 * The journey, as a Basic user:
 *  - creates a morning (AM) and an afternoon (PM) on one date → clean, no clash,
 *    no conflict surfaced;
 *  - adds a second FULL day on another date that already has one → the dialog warns
 *    (overlapping session), the coordinator overrides, and the student's conflict
 *    panel then lists that day;
 *  - removes one of the two → the conflict clears.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';
import { AssignmentDialog, CalendarPage } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';

/** Every soft code we don't care about here — accepted so the test isolates the clash. */
const OVERRIDES = [
	'session_clash',
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule'
];

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

test.describe('CF-L1 half-day sessions and session-clash visibility', { tag: ['@stage1'] }, () => {
	test('AM + PM is clean; a second full day clashes, warns, and shows as a conflict', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(200000);
		const kysely = db as Kysely<DB>;
		const roster = await populatedSandbox(asAdmin, `CF-L1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		// Dedicated student so the conflict panel reflects only this journey.
		const stamp = Date.now();
		const created = (
			await api.post<{ id?: string; student?: { id: string } }>('/api/students', {
				name: `L1 Student ${stamp}`,
				email: `l1_${stamp}@example.com`
			})
		).data as unknown as { id?: string; student?: { id: string } };
		const sid = created?.student?.id ?? created?.id;
		expect(sid).toBeTruthy();
		await api.post(`/api/scheduling-periods/${roster.sandbox.id}/entities`, {
			entityType: 'students',
			entityIds: [sid]
		});

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const site = roster.sites.find((s) => s.name === 'Metro General Hospital')!;
		const [d1, d2] = futureWeekdays(2, 12);

		const post = (date: string, session: string, credit: number) =>
			api.post('/api/schedules/assignments', {
				student_id: sid,
				preceptor_id: amanda.id,
				clerkship_id: fm.id,
				site_id: site.id,
				date,
				session,
				credit_value: credit,
				override_codes: OVERRIDES
			});

		// --- Morning (AM) on d1 via API ----------------------------------------
		expect((await post(d1, 'am', 0.5)).ok).toBe(true);

		// --- Afternoon (PM) on d1 via the real dialog: must be clean -----------
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectStudent(`L1 Student ${stamp}`);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		await dialog.selectSite('Metro General Hospital');
		await dialog.pickDay(d1);
		await dialog.setSession('pm');
		// AM already booked + this PM = no session clash.
		await expect(dialog.overrideSummary()).not.toContainText(/overlapping session/i);
		await dialog.submitAndExpectCreated();

		// d1 holds a morning + an afternoon: no session clash for the student.
		const afterHalves = await api.get<{ byStudent: Record<string, Array<{ date: string; code: string }>> }>(
			'/api/schedules/validation'
		);
		const d1Conflicts = (afterHalves.data?.byStudent?.[sid!] ?? []).filter(
			(v) => v.date === d1 && v.code === 'session_clash'
		);
		expect(d1Conflicts).toEqual([]);

		// --- Full day #1 on d2 via API -----------------------------------------
		expect((await post(d2, 'full', 1)).ok).toBe(true);

		// --- Full day #2 on d2 via the dialog: MUST warn about the session clash --
		await dialog.open();
		await dialog.selectStudent(`L1 Student ${stamp}`);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		await dialog.selectSite('Metro General Hospital');
		await dialog.pickDay(d2);
		await dialog.setSession('full');
		await expect(dialog.overrideSummary()).toContainText(/overlapping session/i);
		await dialog.submitAndExpectCreated();

		// --- The student's conflict panel lists the clashing day ---------------
		await asAdmin.goto(`/students/${sid}`);
		const panel = asAdmin.getByTestId('student-conflicts');
		await expect(panel).toBeVisible({ timeout: 15000 });
		await expect(asAdmin.getByTestId(`student-conflict-session_clash-${d2}`)).toBeVisible();
		// d1 (the clean AM + PM pair) is NOT flagged.
		await expect(asAdmin.getByTestId(`student-conflict-session_clash-${d1}`)).toHaveCount(0);

		// --- Remove one of the two on d2 → the conflict clears -----------------
		const d2Rows = await kysely
			.selectFrom('schedule_assignments')
			.select('id')
			.where('student_id', '=', sid!)
			.where('date', '=', d2)
			.execute();
		expect(d2Rows.length).toBe(2);
		const del = await api.delete(`/api/schedules/assignments/${d2Rows[0].id}?force=true`);
		expect(del.ok).toBe(true);

		await asAdmin.goto(`/students/${sid}`);
		await expect(asAdmin.getByTestId(`student-conflict-session_clash-${d2}`)).toHaveCount(0, {
			timeout: 15000
		});
	});
});
