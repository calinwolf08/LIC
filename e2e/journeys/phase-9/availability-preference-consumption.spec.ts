// @coverage @finding(CF-H8) @req(R3.2)
/**
 * CF-H8 (consumption) — the availability preference field is actually *used*.
 *
 * Client feedback: "Preceptor available need to model 'in a pinch' or
 * 'preferred'." Storing the tag (CF-H8) is only half of it — the coordinator
 * expects the app to act on it:
 *
 *  - Basic (manual): assigning a student on an "in a pinch" day while the
 *    preceptor still has an open "preferred" day is allowed, but raises a soft,
 *    overrideable warning that is recorded on the assignment, and the
 *    whole-schedule validation notes it.
 *  - Gated (auto-generation): the engine weights preferred days ahead of
 *    in-a-pinch days and never places an in-a-pinch day while a preferred day is
 *    open.
 */

import { test, expect, apiOf, assignmentsForSchedule, parseCodes, type Page } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from '../phase-3/helpers';
import { generationSandbox, weekdaysBetween } from '../phase-5/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function fromTodayOffset(n: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** `count` distinct future weekdays (Mon–Fri), starting at day offset `startAt`. */
function futureWeekdays(count: number, startAt: number): string[] {
	const out: string[] = [];
	let n = startAt;
	while (out.length < count) {
		const date = fromTodayOffset(n);
		const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) out.push(date);
		n++;
	}
	return out;
}

test.describe('CF-H8 preference is consumed (manual + auto)', () => {
	test(
		'Basic: an in-a-pinch assignment with a preferred day open warns, is recorded, and is noted',
		{ tag: ['@stage1'] },
		async ({ asAdmin, sandbox, db }) => {
			test.setTimeout(150000);
			const kysely = db as Kysely<DB>;
			const roster = await populatedSandbox(asAdmin, `CF-H8c ${Date.now()}`);
			sandbox.register(roster.sandbox);

			const amanda = roster.preceptors.find((p) => p.name === 'Dr. Amanda Smith')!;
			const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
			const familyMed = roster.clerkships.find((c) => c.name === 'Family Medicine')!;

			// A site Dr. Amanda serves — availability rows need one. The
			// preferred_day_available check itself is site-agnostic, and the dialog
			// resolves the assignment site on its own (as CF-F5 does), so any site she
			// serves is fine here.
			void familyMed;
			const precSites = await kysely
				.selectFrom('preceptor_sites')
				.select('site_id')
				.where('preceptor_id', '=', amanda.id)
				.execute();
			let siteId = precSites[0]?.site_id;
			if (!siteId) {
				const anyAvail = await kysely
					.selectFrom('preceptor_availability')
					.select('site_id')
					.where('preceptor_id', '=', amanda.id)
					.where('site_id', 'is not', null)
					.executeTakeFirst();
				siteId = anyAvail?.site_id ?? roster.sites[0]?.id;
			}
			expect(siteId, 'Dr. Amanda serves a site').toBeTruthy();

			// One "in a pinch" day and one open "preferred" day, both in range. Clear any
			// seeded rows on those dates first so each date has exactly our row.
			const [pinchDay, preferredDay] = futureWeekdays(2, 20);
			const ts = new Date().toISOString();
			for (const [date, preference] of [
				[pinchDay, 'in_a_pinch'],
				[preferredDay, 'preferred']
			] as const) {
				await kysely
					.deleteFrom('preceptor_availability')
					.where('preceptor_id', '=', amanda.id)
					.where('date', '=', date)
					.execute();
				await kysely
					.insertInto('preceptor_availability')
					.values({
						id: crypto.randomUUID(),
						preceptor_id: amanda.id,
						site_id: siteId!,
						date,
						is_available: 1,
						preference,
						created_at: ts,
						updated_at: ts
					})
					.execute();
			}

			// Assign Alice to Dr. Amanda on the in-a-pinch day through the real dialog.
			await asAdmin.goto(`/students/${alice.id}`);
			const dialog = new AssignmentDialog(asAdmin);
			await dialog.open();
			await dialog.selectClerkship('Family Medicine');
			await dialog.selectPreceptor('Dr. Amanda Smith');
			await dialog.pickDay(pinchDay);
			// Accepts every override conversation, including "A preferred day is
			// available"; if that conversation never appeared the code below would be
			// absent and the assertion would fail.
			await dialog.submitAndExpectCreated();

			// The accepted override is recorded on the assignment.
			const rows = await assignmentsForSchedule(kysely, roster.sandbox.id);
			const row = rows.find((r) => r.date === pinchDay && r.preceptor_id === amanda.id);
			expect(row, 'the assignment was created').toBeTruthy();
			expect(parseCodes(row!.override_codes).includes('preferred_day_available')).toBe(true);

			// Whole-schedule validation notes it, too (the preferred day is still open).
			const validation = await apiOf(asAdmin).get<{
				counts?: Record<string, number>;
				violations?: Array<{ code: string }>;
			}>('/api/schedules/validation');
			expect(validation.ok).toBe(true);
			const noted =
				(validation.data?.counts?.preferred_day_available ?? 0) >= 1 ||
				(validation.data?.violations ?? []).some((v) => v.code === 'preferred_day_available');
			expect(noted, 'schedule validation notes the preferred-day-available finding').toBe(true);
		}
	);

	test(
		'Gated: auto-generation fills preferred days and never an in-a-pinch day while preferred is open',
		{ tag: ['@stage2'] },
		async ({ asAdmin, sandbox, db }) => {
			test.setTimeout(180000);
			const kysely = db as Kysely<DB>;
			// One student, two required days, ample capacity and availability.
			const gen = await generationSandbox(asAdmin, kysely, {
				requiredDays: 2,
				students: 1,
				maxStudents: 5
			});
			sandbox.register(gen.sandbox);

			// Of the range's future weekdays, tag two as "in a pinch" (earlier) and two
			// as "preferred" (later). Every other day stays untagged. The engine must
			// pick the two preferred days even though they fall later on the calendar.
			const futureWeekdaysInRange = weekdaysBetween(gen.sandbox.start, gen.sandbox.end).filter(
				(d) => d >= fromTodayOffset(1)
			);
			expect(futureWeekdaysInRange.length).toBeGreaterThanOrEqual(4);
			const pinchDays = futureWeekdaysInRange.slice(0, 2);
			const preferredDays = futureWeekdaysInRange.slice(2, 4);

			const tag = async (dates: string[], preference: 'preferred' | 'in_a_pinch') => {
				for (const date of dates) {
					await kysely
						.updateTable('preceptor_availability')
						.set({ preference })
						.where('preceptor_id', '=', gen.preceptorId)
						.where('date', '=', date)
						.execute();
				}
			};
			await tag(pinchDays, 'in_a_pinch');
			await tag(preferredDays, 'preferred');

			// Run a full generation over the same session's API (the modal button is
			// flaky under Playwright; the placement is the point).
			const run = await apiOf(asAdmin).post('/api/schedules/generate', {
				startDate: gen.sandbox.start,
				endDate: gen.sandbox.end,
				strategy: 'full-reoptimize'
			});
			expect(run.ok).toBe(true);

			const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
			const studentRows = rows.filter((r) => r.student_id === gen.studentIds[0]);
			const placedDates = studentRows.map((r) => r.date).sort();

			expect(placedDates.length).toBe(gen.requiredDays);
			// The two preferred days were used…
			expect(placedDates).toEqual([...preferredDays].sort());
			// …and no in-a-pinch day was touched while a preferred day was open.
			expect(placedDates.some((d) => pinchDays.includes(d))).toBe(false);
		}
	);
});
