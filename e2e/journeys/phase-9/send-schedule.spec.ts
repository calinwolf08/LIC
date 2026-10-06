// @coverage @finding(CF-K1) @req(R9)
/**
 * CF-K1 — Send schedule (per-recipient, FERPA minimum-necessary).
 *
 * The coordinator opens the send dialog, selects recipients across types, and
 * previews each recipient's view. The FERPA assertion is visible in the flow: a
 * preceptor's preview shows only their own student's day and never another
 * student's. The send then completes with a confirmation. Redaction itself is
 * unit-proven in distribution-service.test.ts.
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { CalendarPage } from '../../pages';
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
/** The first weekday strictly after `date` — so two "future weekdays" never collide
 * onto the same Monday when today's weekday makes their offsets line up. */
function nextWeekday(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	do {
		d.setUTCDate(d.getUTCDate() + 1);
	} while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
	return d.toISOString().slice(0, 10);
}

const SAFETY = [
	'block_week_conflict',
	'session_clash',
	'mutual_exclusion',
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

test.describe('CF-K1 send schedule', { tag: ['@stage1'] }, () => {
	test("preview shows a preceptor only their own student; send confirms", async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(200000);
		const roster = await populatedSandbox(asAdmin, `CF-K1 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
		const james = roster.preceptors.find((p) => p.name === 'Dr. James Brown')!;
		const fm = roster.clerkships.find((c) => c.name === 'Family Medicine')!;
		const site = roster.sites[0];
		const studentA = roster.students[0];
		const studentB = roster.students[1];
		expect(studentA && studentB && studentA.id !== studentB.id).toBeTruthy();

		const day = futureWeekday(9);
		const day2 = nextWeekday(day); // always a distinct later weekday (never collides with `day`)
		expect(day2).not.toBe(day);
		// Student A: an AM half-day with Amanda (L1) on `day`, plus a free day (M2) on
		// `day2`. Student B: a full day with James on `day`. This lets the preview prove
		// session rendering and that a non-clinical day surfaces only in the student's
		// own view, never a preceptor's.
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: studentA.id,
					preceptor_id: amanda.id,
					clerkship_id: fm.id,
					site_id: site.id,
					date: day,
					session: 'am',
					override_codes: SAFETY
				})
			).ok
		).toBe(true);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: studentA.id,
					kind: 'free_day',
					date: day2,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: studentB.id,
					preceptor_id: james.id,
					clerkship_id: fm.id,
					site_id: site.id,
					date: day,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Open the send dialog and select recipients ----------------------------
		const cal = new CalendarPage(asAdmin);
		await cal.goto();
		await asAdmin.getByRole('button', { name: 'Send schedule' }).click();
		const dialog = asAdmin.getByTestId('send-schedule');
		await expect(dialog).toBeVisible({ timeout: 15000 });

		await dialog.getByTestId(`recipient-preceptor-${amanda.id}`).check();
		await dialog.getByTestId(`recipient-student-${studentA.id}`).check();

		// --- Preview: Amanda sees only her own student (FERPA minimum-necessary),
		// with the half-day session rendered and NO non-clinical day (that's private
		// to the student). Student A's own view carries their free day. --------------
		await dialog.getByTestId('preview-recipients').click();
		const amandaPreview = dialog.getByTestId(`recipient-preview-preceptor-${amanda.id}`);
		await expect(amandaPreview).toBeVisible({ timeout: 15000 });
		await expect(amandaPreview).toContainText(studentA.name);
		await expect(amandaPreview).not.toContainText(studentB.name);
		// L1 integration: the AM half-day is shown as such.
		await expect(amandaPreview).toContainText(/AM/);
		// M2 integration: the student's free day (day2) never appears in a preceptor view.
		await expect(amandaPreview).not.toContainText(day2);

		const studentPreview = dialog.getByTestId(`recipient-preview-student-${studentA.id}`);
		await expect(studentPreview).toBeVisible();
		// The student sees their own free day.
		await expect(studentPreview).toContainText(day2);
		await expect(studentPreview).toContainText(/free day/i);

		// --- Send: confirmation lists the recipients -------------------------------
		await dialog.getByTestId('send-recipients').click();
		const confirmation = dialog.getByTestId('send-confirmation');
		await expect(confirmation).toBeVisible({ timeout: 15000 });
		await expect(confirmation).toContainText(amanda.name);

		// The audit log recorded the send (ids + counts only).
		// (No API to read it back in this journey; the audit write is unit-proven.)
	});
});
