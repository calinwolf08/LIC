// @coverage @req(G10)
// @coverage @finding(P5-d)
/**
 * J5.4 — Fallbacks and approval (e2e plan Phase 5).
 *
 * A clerkship whose team's primary member cannot cover all the required days,
 * with a fallback-only backup member who can: generation places what the primary
 * can and fills the remaining days from the backup — fallback coverage completes
 * the requirement.
 *
 * A day held for review (`pending_approval`) is then approved through the same
 * assignment PATCH a coordinator uses, flipping it to `scheduled`. The endpoint
 * now persists whatever status the engine emits for a generated day (finding
 * P5-d — the status was dropped before persistence, symmetric with P5-c); the
 * engine's own trigger for writing `pending_approval` on a backup day is covered
 * by the fallback integration tests, so here the review state is induced directly
 * and the approval path asserted end to end.
 *
 * fallbackRequiresApproval is a per-school global default (shared state), so the
 * test captures and restores it.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { generationSandbox, weekdaysBetween } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const OUTPATIENT = '/api/scheduling-config/global-defaults/outpatient';

test.describe('J5.4 fallbacks and approval', { tag: ['@stage2'] }, () => {
	test('a backup covers the primary gap, and a review day is approved', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		const api = apiOf(asAdmin);
		const stamp = Date.now();

		// Primary preceptor available on only ONE future weekday; one onboarded
		// student owing 3 days, so 2 days must come from the backup team.
		const gen = await generationSandbox(asAdmin, kysely, {
			requiredDays: 3,
			students: 1,
			availabilityDays: 1
		});
		sandbox.register(gen.sandbox);

		// Backup preceptor at the same site/health system, available on every future
		// weekday.
		const backup = (
			await api.post<{ id: string }>('/api/preceptors', {
				name: `Dr Backup ${stamp}`,
				email: `backup_${stamp}@example.com`,
				max_students: 5,
				health_system_id: gen.hsId,
				site_ids: [gen.siteId]
			})
		).data!.id;
		const today = new Date().toISOString().slice(0, 10);
		const ts = new Date().toISOString();
		const backupAvail = weekdaysBetween(gen.sandbox.start, gen.sandbox.end)
			.filter((d) => d >= today)
			.map((date) => ({
				id: crypto.randomUUID(),
				preceptor_id: backup,
				site_id: gen.siteId,
				date,
				is_available: 1,
				created_at: ts,
				updated_at: ts
			}));
		await kysely.insertInto('preceptor_availability').values(backupAvail).execute();

		// One team for the clerkship: the primary member (limited availability) plus
		// the backup as a fallback-only member, so the backup is used only to fill
		// gaps the primary cannot cover.
		expect(
			(
				await api.post('/api/preceptors/teams', {
					clerkshipId: gen.clerkshipId,
					members: [
						{ preceptorId: gen.preceptorId, priority: 1 },
						{ preceptorId: backup, priority: 2, isFallbackOnly: true }
					]
				})
			).ok
		).toBe(true);

		// Require approval for backups (per-school global default; restore after).
		const original = (await api.get<Record<string, unknown>>(OUTPATIENT)).data!;
		expect(
			(
				await api.put(OUTPATIENT, {
					...original,
					fallbackRequiresApproval: true,
					allowFallbacks: true
				})
			).ok
		).toBe(true);

		try {
			expect(
				(
					await api.post('/api/schedules/generate', {
						startDate: gen.sandbox.start,
						endDate: gen.sandbox.end,
						strategy: 'full-reoptimize'
					})
				).ok
			).toBe(true);

			// --- Fallback coverage: the requirement is completed, with the backup
			// covering the days the primary could not ---
			const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
			expect(rows).toHaveLength(gen.requiredDays); // all 3 days placed
			const backupRows = rows.filter((r) => r.preceptor_id === backup);
			expect(backupRows.length).toBeGreaterThanOrEqual(gen.requiredDays - 1);

			// --- Approval: a day held for review is approved via the assignment PATCH
			// (the coordinator's approve action), flipping pending_approval → scheduled ---
			const review = backupRows[0];
			await kysely
				.updateTable('schedule_assignments')
				.set({ status: 'pending_approval' })
				.where('id', '=', review.id)
				.execute();
			const approve = await api.patch(`/api/schedules/assignments/${review.id}`, {
				status: 'scheduled'
			});
			expect(approve.ok).toBe(true);
			const approved = (await assignmentsForSchedule(kysely, gen.scheduleId)).find(
				(r) => r.id === review.id
			)!;
			expect(approved.status).toBe('scheduled');
		} finally {
			await api.put(OUTPATIENT, original);
		}
	});
});
