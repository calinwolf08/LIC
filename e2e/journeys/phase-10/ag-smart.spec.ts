// @coverage @scenario(AG-7) @req(R3.1) @finding(CF-M2)
/**
 * AG-7 — Smart (minimal-change) regeneration preserves the past and locked work,
 * driven through the real Generate dialog.
 *
 * World spans a past Monday into the future. The coordinator hand-places a PAST
 * clinical day and a LOCKED future clinical day, then runs smart regeneration from
 * today. Smart mode must keep both (past is before the cutoff; locked is always
 * kept) and generate only the one remaining future day to reach the requirement.
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { buildWorld, addDays, fromTodayUTC, dow } from '../../worlds/world-builder';
import { smartWorld } from '../../worlds/catalog';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const SAFETY = [
	'preceptor_capacity',
	'preceptor_unavailable',
	'not_onboarded',
	'outside_core_preceptor',
	'preferred_day_available',
	'over_required_days',
	'site_not_allowed',
	'blackout_date',
	'outside_schedule',
	'session_clash',
	'past_date'
];

/** The first Monday at least `daysBack` days before today. */
function pastMonday(daysBack: number): string {
	let n = daysBack;
	for (;;) {
		const d = fromTodayUTC(-n);
		if (dow(d) === 1) return d;
		n++;
	}
}

test.describe('AG-7 smart regeneration', { tag: ['@stage2', '@long'] }, () => {
	test('preserves past and locked days, regenerates only the future gap', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const spec = smartWorld();
		spec.start = pastMonday(14);
		spec.end = addDays(spec.start, 55);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, spec);
		sandbox.register(world.sandbox);
		const api = apiOf(asAdmin);

		const sid = world.ids.student['Alice'];
		const fmId = world.ids.clerkship['Family Medicine'];
		const precId = world.ids.preceptor['Dr. FM'];
		const siteId = world.ids.site['Clinic'];
		const pastDay = world.anchor; // day 0 — in the past
		const lockDay = addDays(world.anchor, 21); // future, locked
		const today = fromTodayUTC(0);
		expect(pastDay < today).toBe(true);
		expect(lockDay > today).toBe(true);

		// Hand-place a PAST clinical day and a LOCKED future clinical day.
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: precId,
					clerkship_id: fmId,
					site_id: siteId,
					date: pastDay,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: precId,
					clerkship_id: fmId,
					site_id: siteId,
					date: lockDay,
					locked: true,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Smart regeneration from today, via the real dialog ---
		await new GeneratePage(asAdmin).generate('smart', { fromDate: today });

		const rows = (await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId)).filter(
			(r) => r.student_id === sid && r.kind === 'clinical'
		);

		// The past day and the locked day both survived.
		expect(rows.some((r) => r.date === pastDay), 'past day preserved').toBe(true);
		expect(rows.some((r) => r.date === lockDay && r.locked === 1), 'locked day preserved').toBe(true);

		// Exactly one new future day was generated to complete the 3-day requirement.
		expect(rows).toHaveLength(3);
		const generated = rows.filter((r) => r.source === 'generated');
		expect(generated).toHaveLength(1);
		expect(generated[0].date >= today, 'generated day is in the future').toBe(true);
	});
});
