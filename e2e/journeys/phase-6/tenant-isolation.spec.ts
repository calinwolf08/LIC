// @coverage @finding(F-02) @finding(F-03) @finding(F-04) @finding(F-27)
/**
 * J6.5 — Tenant isolation under every write path (e2e plan Phase 6).
 *
 * A flurry of Stage 2 + Stage 1 writes by tenant A (generate, add a team, add a
 * blackout, export, regenerate) must leave tenant B's footprint byte-identical,
 * and B must be unable to see or touch A's data: A's generated assignment id 404s
 * from B, B cannot activate A's schedule, and A's schedule-scoped blackout does
 * not flag B's schedule.
 *
 * A is the entitled admin; B is the basic user, given its own concrete footprint
 * (roster + one hand-scheduled day) before A does anything.
 */

import { test, expect, apiOf, snapshotTenant, BASIC, assignmentsForSchedule } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const SAFETY = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];

test.describe('J6.5 tenant isolation under generation', { tag: ['@stage2'] }, () => {
	test("A's generation and writes never touch B, and B cannot reach A", async ({
		asAdmin,
		asBasic,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;

		// --- B (basic) builds a concrete footprint: roster + one hand-scheduled day ---
		const genB = await generationSandbox(asBasic, kysely, { requiredDays: 2, students: 1 });
		sandbox.register(genB.sandbox);
		const bDay = await freeWeekdayForStudents(kysely, [genB.studentIds[0]], 8);
		expect(
			(
				await apiOf(asBasic).post('/api/schedules/assignments', {
					student_id: genB.studentIds[0],
					preceptor_id: genB.preceptorId,
					clerkship_id: genB.clerkshipId,
					site_id: genB.siteId,
					date: bDay,
					override_codes: SAFETY
				})
			).ok
		).toBe(true);

		const before = await snapshotTenant(kysely, BASIC.email);

		// --- A (admin) does a flurry of writes on its own schedule ---
		const genA = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 2 });
		sandbox.register(genA.sandbox);
		const apiA = apiOf(asAdmin);
		const gen = (strategy: string) =>
			apiA.post('/api/schedules/generate', {
				startDate: genA.sandbox.start,
				endDate: genA.sandbox.end,
				strategy
			});
		expect((await gen('full-reoptimize')).ok).toBe(true);
		expect(
			(await apiA.post('/api/blackout-dates', { date: '2027-03-03', reason: 'A only' })).ok
		).toBe(true);
		expect(
			(
				await apiA.post('/api/preceptors/teams', {
					clerkshipId: genA.clerkshipId,
					members: [{ preceptorId: genA.preceptorId, priority: 1 }]
				})
			).ok
		).toBe(true);
		expect(
			(
				await asAdmin.request.get(
					`/api/schedules/export?start_date=${genA.sandbox.start}&end_date=${genA.sandbox.end}`
				)
			).status()
		).toBe(200);
		expect((await gen('full-reoptimize')).ok).toBe(true); // regenerate (delete-all-unlocked + regen)

		// --- B's footprint is byte-identical after all of A's writes ---
		const after = await snapshotTenant(kysely, BASIC.email);
		expect(after).toEqual(before);

		// --- B cannot reach A's data ---
		const aRows = await assignmentsForSchedule(kysely, genA.scheduleId);
		expect(aRows.length).toBeGreaterThan(0);
		// A's generated assignment 404s from B's session (ownership guard).
		expect((await apiOf(asBasic).delete(`/api/schedules/assignments/${aRows[0].id}`)).status).toBe(
			404
		);
		// B cannot activate A's schedule.
		expect(
			(await apiOf(asBasic).put('/api/user/active-schedule', { scheduleId: genA.scheduleId }))
				.status
		).toBe(404);
		// A's schedule-scoped blackout does not flag B's schedule.
		const bValidation = (
			await apiOf(asBasic).get<{ counts: Record<string, number> }>('/api/schedules/validation')
		).data!;
		expect(bValidation.counts['blackout_date'] ?? 0).toBe(0);
	});
});
