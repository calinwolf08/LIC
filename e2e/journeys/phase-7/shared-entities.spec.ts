// @coverage @req(R1.3)
// @coverage @finding(D7-3) @finding(D7-4)
/**
 * J7.2 — Shared entities across schedules (e2e plan Phase 7).
 *
 * The same student, preceptor, site and clerkship can belong to more than one
 * schedule owned by the same coordinator. This journey builds two overlapping
 * schedules (A and B) that share those entities and pins down the cross-schedule
 * behaviour:
 *
 *   - **Preceptor capacity is GLOBAL, not per-schedule** (decision D7-3): a
 *     preceptor booked to capacity on a calendar day in schedule A is over
 *     capacity for that same day in schedule B — the validator counts a
 *     preceptor's day across every schedule, mirroring the global
 *     UNIQUE(student, date) rule for students.
 *   - **SharedEntityWarning** appears on a shared student's page, naming both
 *     schedules and badging the active one.
 *   - **A change to a shared location ripples to both schedules' health**:
 *     revoking the clerkship↔site eligibility surfaces `site_not_allowed` in both
 *     A's and B's validation.
 *   - **Deleting schedule A leaves B intact**: B's assignment survives and the
 *     shared entities are kept (they are not owned by A).
 *
 * (Reconciliation D7-4: the plan says "delete P's site". A shared site row is
 * dependency-blocked from hard deletion; the assertable cross-schedule ripple is
 * the shared site's clerkship-eligibility change, which is what this asserts.)
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { createSandboxSchedule } from '../../fixtures/sandbox';
import { activeScheduleId } from '../../fixtures/api';
import { futureWeekday } from '../phase-4/helpers';
import { weekdaysBetween } from '../phase-5/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

async function post<T = { id: string }>(page: Page, path: string, body: unknown): Promise<T> {
	const res = await apiOf(page).post<T>(path, body);
	if (!res.ok || !res.data) throw new Error(`POST ${path} failed (${res.status})`);
	return res.data;
}

async function activate(page: Page, scheduleId: string) {
	const res = await apiOf(page).put('/api/user/active-schedule', { scheduleId });
	if (!res.ok) throw new Error(`activate ${scheduleId} failed (${res.status})`);
}

type Junction =
	| 'schedule_students'
	| 'schedule_preceptors'
	| 'schedule_clerkships'
	| 'schedule_sites'
	| 'schedule_health_systems';

async function link(
	db: Kysely<DB>,
	table: Junction,
	scheduleId: string,
	idField: string,
	entityId: string
) {
	await db
		.insertInto(table)
		.values({
			id: crypto.randomUUID(),
			schedule_id: scheduleId,
			[idField]: entityId,
			created_at: new Date().toISOString()
		} as never)
		.execute();
}

test.describe('J7.2 shared entities across schedules', { tag: ['@long', '@stage1'] }, () => {
	test('global capacity, shared-entity warning, cross-schedule ripple, isolated delete', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		const baselineId = await activeScheduleId(asAdmin);

		// --- Schedule A (active): build the shared world here ---
		const schedA = await createSandboxSchedule(asAdmin, { name: `A ${stamp}` });
		sandbox.register(schedA);
		const hsId = (await post(asAdmin, '/api/health-systems', { name: `HS ${stamp}` })).id;
		const siteId = (
			await post(asAdmin, '/api/sites', { name: `Site ${stamp}`, health_system_id: hsId })
		).id;
		const clerkshipId = (
			await post(asAdmin, '/api/clerkships', {
				name: `Clerkship ${stamp}`,
				required_days: 2,
				clerkship_type: 'outpatient'
			})
		).id;
		// Capacity of exactly 1 student/day makes the global-capacity conflict sharp.
		const preceptorId = (
			await post(asAdmin, '/api/preceptors', {
				name: `Dr Shared ${stamp}`,
				email: `shared_${stamp}@example.com`,
				max_students: 1,
				health_system_id: hsId,
				site_ids: [siteId]
			})
		).id;
		const st1 = (
			await post(asAdmin, '/api/students', {
				name: `Shared Student ${stamp}`,
				email: `st1_${stamp}@example.com`
			})
		).id;

		const ts = new Date().toISOString();
		await kysely
			.insertInto('clerkship_sites')
			.values({ clerkship_id: clerkshipId, site_id: siteId, created_at: ts })
			.execute();

		// --- Schedule B: shares HS/site/clerkship/preceptor/st1, plus its own st2 ---
		const schedB = await createSandboxSchedule(asAdmin, { name: `B ${stamp}` }); // now active
		sandbox.register(schedB);
		await link(kysely, 'schedule_health_systems', schedB.id, 'health_system_id', hsId);
		await link(kysely, 'schedule_sites', schedB.id, 'site_id', siteId);
		await link(kysely, 'schedule_clerkships', schedB.id, 'clerkship_id', clerkshipId);
		await link(kysely, 'schedule_preceptors', schedB.id, 'preceptor_id', preceptorId);
		await link(kysely, 'schedule_students', schedB.id, 'student_id', st1);
		const st2 = (
			await post(asAdmin, '/api/students', {
				name: `B-only Student ${stamp}`,
				email: `st2_${stamp}@example.com`
			})
		).id; // auto-associated with B (active)

		// Availability (global) + onboarding for both students at the HS.
		const day = futureWeekday(8);
		await kysely
			.insertInto('preceptor_availability')
			.values(
				weekdaysBetween(schedA.start, schedA.end).map((date) => ({
					id: crypto.randomUUID(),
					preceptor_id: preceptorId,
					site_id: siteId,
					date,
					is_available: 1,
					created_at: ts,
					updated_at: ts
				}))
			)
			.execute();
		await kysely
			.insertInto('student_health_system_onboarding')
			.values(
				[st1, st2].map((student_id) => ({
					id: crypto.randomUUID(),
					student_id,
					health_system_id: hsId,
					is_completed: 1,
					created_at: ts,
					updated_at: ts
				}))
			)
			.execute();

		// --- Assign P → st1 on `day` in schedule A (clean, at capacity 1) ---
		await activate(asAdmin, schedA.id);
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: st1,
					preceptor_id: preceptorId,
					clerkship_id: clerkshipId,
					site_id: siteId,
					date: day
				})
			).ok
		).toBe(true);

		// --- In schedule B, the same preceptor on the same day is OVER CAPACITY ---
		// (global capacity: the A booking counts here too — decision D7-3)
		await activate(asAdmin, schedB.id);
		{
			const dry = await api.post<{ soft: Array<{ code: string }> }>('/api/schedules/assignments', {
				student_id: st2,
				preceptor_id: preceptorId,
				clerkship_id: clerkshipId,
				site_id: siteId,
				date: day,
				dry_run: true
			});
			expect(dry.ok).toBe(true);
			expect(dry.data!.soft.some((v) => v.code === 'preceptor_capacity')).toBe(true);
		}
		// Accept the override to give B a concrete assignment for the ripple/delete steps.
		expect(
			(
				await api.post('/api/schedules/assignments', {
					student_id: st2,
					preceptor_id: preceptorId,
					clerkship_id: clerkshipId,
					site_id: siteId,
					date: day,
					override_codes: ['preceptor_capacity']
				})
			).ok
		).toBe(true);

		// --- SharedEntityWarning on the shared student's page names both schedules ---
		{
			const res = await api.get<{ schedules: Array<{ id: string; name: string }> }>(
				`/api/entities/students/${st1}/schedules`
			);
			expect(res.ok).toBe(true);
			expect(res.data!.schedules.length).toBeGreaterThanOrEqual(2);
			// The SharedEntityWarning lives on the Details tab (EntityTabs syncs ?tab=).
			await asAdmin.goto(`/students/${st1}?tab=details`);
			await expect(asAdmin.getByText(/changes will affect all of them/i)).toBeVisible({
				timeout: 15000
			});
			// Both schedules are named in the warning's list (scoped to <li> so the
			// schedule switcher's copy of the name is not counted).
			await expect(asAdmin.getByRole('listitem').filter({ hasText: `A ${stamp}` })).toBeVisible();
			await expect(asAdmin.getByRole('listitem').filter({ hasText: `B ${stamp}` })).toBeVisible();
		}

		// --- A change to the shared site's clerkship eligibility ripples to BOTH ---
		// Re-point the clerkship to a DIFFERENT site → the shared assignments (at the
		// original site) become site_not_allowed in both schedules. (D7-4)
		// (Removing the link entirely would mean "no restriction / all sites allowed",
		// so we swap the allowed site instead.)
		const otherSiteId = (
			await post(asAdmin, '/api/sites', { name: `Other Site ${stamp}`, health_system_id: hsId })
		).id;
		await kysely
			.deleteFrom('clerkship_sites')
			.where('clerkship_id', '=', clerkshipId)
			.where('site_id', '=', siteId)
			.execute();
		await kysely
			.insertInto('clerkship_sites')
			.values({
				clerkship_id: clerkshipId,
				site_id: otherSiteId,
				created_at: new Date().toISOString()
			})
			.execute();
		const siteNotAllowed = async (scheduleId: string) => {
			await activate(asAdmin, scheduleId);
			const v = await api.get<{ counts: Record<string, number> }>('/api/schedules/validation');
			return v.data!.counts['site_not_allowed'] ?? 0;
		};
		expect(await siteNotAllowed(schedA.id)).toBeGreaterThanOrEqual(1);
		expect(await siteNotAllowed(schedB.id)).toBeGreaterThanOrEqual(1);

		// --- Deleting schedule A leaves B intact ---
		if (baselineId) await activate(asAdmin, baselineId);
		expect((await api.delete(`/api/scheduling-periods/${schedA.id}`)).ok).toBe(true);

		// B's own assignment (st2) survives, and the shared entities are kept.
		const bRows = await assignmentsForSchedule(kysely, schedB.id);
		expect(bRows.some((r) => r.student_id === st2)).toBe(true);
		expect(
			await kysely.selectFrom('students').select('id').where('id', '=', st1).executeTakeFirst()
		).toBeTruthy();
		expect(
			await kysely
				.selectFrom('preceptors')
				.select('id')
				.where('id', '=', preceptorId)
				.executeTakeFirst()
		).toBeTruthy();
		// A's assignment (st1) is gone with A.
		expect(bRows.some((r) => r.student_id === st1)).toBe(false);
	});
});
