/**
 * J6.4 — Validation payload equality (e2e plan Phase 6).
 *
 * Two users — one entitled, one not — with identically-shaped schedules must get
 * the same Stage 1 answers. Built the same way (same roster, one identical clean
 * assignment), their whole-schedule validation and calendar summary are equal on
 * the id-free fields, and their setup checklists are identical except that the
 * entitled user additionally carries the Stage 2 (autogen-ready) item.
 */

import { test, expect, apiOf, type Page } from '../../fixtures';
import { generationSandbox } from '../phase-5/helpers';
import { futureWeekday } from '../phase-4/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

interface ChecklistItem {
	id: string;
	done: boolean;
}

async function checklist(page: Page): Promise<ChecklistItem[]> {
	const res = await apiOf(page).get<ChecklistItem[]>('/api/schedules/checklist');
	return (res.data ?? []).map((i) => ({ id: i.id, done: i.done }));
}

test.describe('J6.4 validation payload equality', { tag: ['@stage1'] }, () => {
	test('identical schedules yield equal Stage 1 payloads across tiers', async ({
		asAdmin,
		asBasic,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;

		// Identically-shaped, generation-ready schedules for each user.
		const genA = await generationSandbox(asAdmin, kysely, { requiredDays: 2, students: 1 });
		const genB = await generationSandbox(asBasic, kysely, { requiredDays: 2, students: 1 });
		sandbox.register(genA.sandbox);
		sandbox.register(genB.sandbox);

		// One identical, clean assignment in each (same date, same relative roles).
		const day = futureWeekday(8);
		for (const [page, g] of [
			[asAdmin, genA],
			[asBasic, genB]
		] as const) {
			const r = await apiOf(page).post('/api/schedules/assignments', {
				student_id: g.studentIds[0],
				preceptor_id: g.preceptorId,
				clerkship_id: g.clerkshipId,
				site_id: g.siteId,
				date: day
			});
			expect(r.ok, 'clean assignment should be accepted for both tiers').toBe(true);
		}

		// --- Whole-schedule validation: id-free fields are equal ---
		const vA = (
			await apiOf(asAdmin).get<{ violations: unknown[]; counts: Record<string, number> }>(
				'/api/schedules/validation'
			)
		).data!;
		const vB = (
			await apiOf(asBasic).get<{ violations: unknown[]; counts: Record<string, number> }>(
				'/api/schedules/validation'
			)
		).data!;
		expect(vA.counts).toEqual(vB.counts);
		expect(vA.violations.length).toBe(vB.violations.length);

		// --- Calendar summary: the assignment total matches ---
		const range = `start_date=${genA.sandbox.start}&end_date=${genA.sandbox.end}`;
		const sA = (
			await apiOf(asAdmin).get<{ total_assignments: number }>(`/api/calendar/summary?${range}`)
		).data!;
		const sB = (
			await apiOf(asBasic).get<{ total_assignments: number }>(
				`/api/calendar/summary?start_date=${genB.sandbox.start}&end_date=${genB.sandbox.end}`
			)
		).data!;
		expect(sA.total_assignments).toBe(sB.total_assignments);

		// --- Checklists match on Stage 1; only the entitled user has Stage 2 ---
		const cA = await checklist(asAdmin);
		const cB = await checklist(asBasic);
		const stage1 = (items: ChecklistItem[]) => items.filter((i) => i.id !== 'autogen-ready');
		expect(stage1(cA)).toEqual(stage1(cB));
		expect(cA.some((i) => i.id === 'autogen-ready')).toBe(true);
		expect(cB.some((i) => i.id === 'autogen-ready')).toBe(false);
	});
});
