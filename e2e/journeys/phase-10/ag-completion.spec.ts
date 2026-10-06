// @coverage @scenario(AG-3) @req(R3.1) @finding(CF-M2) @constraint(session_clash)
/**
 * AG-3 — Completion mode fills only the gaps and preserves everything the
 * coordinator hand-made, driven through the real Generate dialog.
 *
 * World: one onboarded student, a clerkship needing 2 clinical days, a preceptor
 * available on several days. The journey hand-places (via API, as the dialog would)
 * a LOCKED clinical day and a non-clinical FREE day, then runs completion mode.
 * Completion must: keep the locked clinical day, keep the free day, add exactly the
 * one missing clinical day, and never place a clinical day on the free day's date.
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { buildWorld, addDays } from '../../worlds/world-builder';
import { completionWorld } from '../../worlds/catalog';
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

test.describe('AG-3 completion mode', { tag: ['@stage2', '@long'] }, () => {
	test('fills the one missing day, preserves the locked clinical and free days', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(240000);
		const world = await buildWorld(asAdmin, db as Kysely<DB>, completionWorld());
		sandbox.register(world.sandbox);
		const api = apiOf(asAdmin);

		const sid = world.ids.student['Alice'];
		const fmId = world.ids.clerkship['Family Medicine'];
		const precId = world.ids.preceptor['Dr. FM'];
		const siteId = world.ids.site['Clinic'];
		const lockedDay = world.anchor; // day 0 — hand-placed + locked
		const freeDay = addDays(world.anchor, 2); // day 2 — non-clinical

		// Hand-place a LOCKED clinical day (1 of 2 required) and a free day.
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					preceptor_id: precId,
					clerkship_id: fmId,
					site_id: siteId,
					date: lockedDay,
					locked: true,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: sid,
					kind: 'free_day',
					date: freeDay,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		// --- Completion run via the real dialog ---
		await new GeneratePage(asAdmin).generate('completion');

		const rows = (await assignmentsForSchedule(db as Kysely<DB>, world.scheduleId)).filter(
			(r) => r.student_id === sid
		);
		const clinical = rows.filter((r) => r.kind === 'clinical');
		const free = rows.filter((r) => r.kind === 'free_day');

		// The locked clinical day survived, and the free day survived.
		expect(rows.some((r) => r.date === lockedDay && r.kind === 'clinical' && r.locked === 1)).toBe(true);
		expect(free.map((r) => r.date)).toEqual([freeDay]);

		// Completion filled the requirement to exactly 2 clinical days, adding one.
		expect(clinical).toHaveLength(2);
		expect(clinical.filter((r) => r.source === 'generated')).toHaveLength(1);

		// No clinical day was placed on the free day's date.
		expect(clinical.some((r) => r.date === freeDay)).toBe(false);
	});
});
