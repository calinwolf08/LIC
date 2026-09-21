// @coverage @req(G1) @req(G7)
// @coverage @finding(P6-a)
/**
 * J6.2 — Gating table, both directions (e2e plan Phase 6).
 *
 * A non-entitled (basic) user is blocked from every Stage 2 surface — the nav
 * item, the /generate* routes, and the generation / config write APIs — while
 * Stage 2 *reads* that share an endpoint stay open (elective-preceptor GET).
 * Crucially it also proves the reverse: no over-gating — the same user can do
 * all of Stage 1 (create entities, hand-schedule, export, add blackout dates,
 * manage electives). Granting the entitlement mid-session reveals the nav on the
 * next navigation, with no re-login (the hook reads the DB).
 *
 * Mutates the seeded basic user's entitlement, so it is restored at the end.
 */

import { test, expect, apiOf, BASIC, grantAutogen, revokeAutogen } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const SAFETY = ['preceptor_capacity', 'preceptor_unavailable', 'not_onboarded'];

test.describe('J6.2 gating table, both directions', { tag: ['@stage1'] }, () => {
	test('basic tier: Stage 2 nav, routes and write APIs are all gated', async ({ asBasic }) => {
		// No Auto-Generate nav item.
		await asBasic.goto('/dashboard');
		await expect(asBasic.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);

		// Every /generate* route is a 403.
		for (const route of [
			'/generate',
			'/generate/results',
			'/generate/settings',
			'/generate/teams'
		]) {
			const res = await asBasic.goto(route);
			expect(res?.status(), `${route} should be 403`).toBe(403);
		}

		// Stage 2 write APIs are forbidden.
		const api = apiOf(asBasic);
		expect(
			(
				await api.post('/api/schedules/generate', {
					startDate: '2026-09-01',
					endDate: '2026-09-30'
				})
			).status
		).toBe(403);
		expect(
			(
				await api.put('/api/scheduling-config/global-defaults/outpatient', {
					assignmentStrategy: 'daily_rotation',
					healthSystemRule: 'no_preference',
					defaultMaxStudentsPerDay: 1,
					defaultMaxStudentsPerYear: 100
				})
			).status
		).toBe(403);
		expect(
			(
				await api.post('/api/scheduling-config/capacity-rules', {
					preceptorId: 'x',
					maxStudentsPerDay: 1
				})
			).status
		).toBe(403);
		expect(
			(
				await api.post('/api/scheduling-config/fallbacks', {
					primaryPreceptorId: 'a',
					fallbackPreceptorId: 'b',
					priority: 1
				})
			).status
		).toBe(403);
	});

	test('basic tier: no over-gating — all of Stage 1 works', async ({ asBasic, sandbox, db }) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		// generationSandbox is pure Stage 1 (entity creates + materialised rows) — a
		// basic user can stand up the whole roster.
		const gen = await generationSandbox(asBasic, kysely, { requiredDays: 2, students: 1 });
		sandbox.register(gen.sandbox);
		const api = apiOf(asBasic);

		// Hand-schedule a day.
		const day = await freeWeekdayForStudents(kysely, [gen.studentIds[0]], 8);
		const created = await api.post('/api/schedules/assignments', {
			student_id: gen.studentIds[0],
			preceptor_id: gen.preceptorId,
			clerkship_id: gen.clerkshipId,
			site_id: gen.siteId,
			date: day,
			override_codes: SAFETY
		});
		expect(created.ok).toBe(true);

		// Export and blackout dates are Stage 1.
		expect(
			(
				await asBasic.request.get(
					`/api/schedules/export?start_date=${gen.sandbox.start}&end_date=${gen.sandbox.end}`
				)
			).status()
		).toBe(200);
		expect((await api.post('/api/blackout-dates', { date: '2027-02-15', reason: 'x' })).ok).toBe(
			true
		);

		// Electives: create + read are Stage 1; only the preceptor-pool WRITE is gated.
		const elective = await api.post<{ id: string }>(
			`/api/scheduling-config/electives?clerkshipId=${gen.clerkshipId}`,
			{ name: `Elective ${Date.now()}`, minimumDays: 1 }
		);
		expect(elective.ok).toBe(true);
		const electiveId = elective.data!.id;
		expect(
			(await api.get(`/api/scheduling-config/electives/${electiveId}/preceptors`)).status
		).toBe(200);
		expect(
			(
				await api.post(`/api/scheduling-config/electives/${electiveId}/preceptors`, {
					preceptorId: gen.preceptorId
				})
			).status
		).toBe(403);
	});

	test('granting the entitlement mid-session reveals the nav', async ({ asBasic, db }) => {
		const kysely = db as Kysely<DB>;
		await asBasic.goto('/dashboard');
		await expect(asBasic.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);
		try {
			await grantAutogen(kysely, BASIC.email);
			// A fresh navigation re-runs the layout load (hook reads the DB) — no re-login.
			await asBasic.goto('/dashboard');
			await expect(asBasic.getByRole('link', { name: 'Auto-Generate' })).toBeVisible({
				timeout: 15000
			});
		} finally {
			await revokeAutogen(kysely, BASIC.email);
		}
	});
});
