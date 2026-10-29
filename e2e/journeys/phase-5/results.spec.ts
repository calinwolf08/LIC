// @coverage @req(G4)
/**
 * J5.7 — Results & diagnostics tell the truth (e2e plan Phase 5).
 *
 * A deliberately scarce schedule — one preceptor at capacity 1/day, available on
 * only 5 weekdays, three students each owing 5 days — cannot be fully placed.
 * The run must report that honestly:
 *   - exactly the available slots are filled (5), the rest are unmet;
 *   - the student-status partition still sums to the whole roster (3);
 *   - the results page shows the unmet table and an incomplete schedule, and says
 *     why each requirement fell short, naming the preceptor whose availability or
 *     capacity to look at;
 *   - /api/schedule/summary's lastRun agrees (incomplete, students unmet).
 * Then raising the preceptor's capacity and re-running Completion (from the
 * Generate button) shrinks the unmet set to zero — the diagnostics move with the
 * fix, and the explanations go away.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { GeneratePage } from '../../pages';
import { generationSandbox } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

function generate(page: Page, start: string, end: string, strategy: string) {
	return apiOf(page).post('/api/schedules/generate', { startDate: start, endDate: end, strategy });
}

interface Summary {
	isComplete: boolean;
	studentsWithUnmetRequirements: unknown[];
	stats: { totalStudents: number };
	lastRun: unknown | null;
}

test.describe('J5.7 results & diagnostics', { tag: ['@stage2'] }, () => {
	test('scarcity is reported truthfully and shrinks when capacity is raised', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		// 3 students × 5 days = 15 demand; 1 preceptor × 1/day × 5 days = 5 supply.
		const gen = await generationSandbox(asAdmin, kysely, {
			requiredDays: 5,
			students: 3,
			maxStudents: 1,
			availabilityDays: 5
		});
		sandbox.register(gen.sandbox);

		// --- Full run fills exactly the 5 available slots; the rest is unmet ---
		expect(
			(await generate(asAdmin, gen.sandbox.start, gen.sandbox.end, 'full-reoptimize')).ok
		).toBe(true);
		expect(await assignmentsForSchedule(kysely, gen.scheduleId)).toHaveLength(5);

		const s1 = (await apiOf(asAdmin).get<Summary>('/api/schedule/summary')).data!;
		expect(s1.isComplete).toBe(false);
		expect(s1.stats.totalStudents).toBe(3);
		expect(s1.studentsWithUnmetRequirements.length).toBeGreaterThan(0);
		expect(s1.lastRun).not.toBeNull();

		// The student-status partition sums to the whole roster (nobody lost).
		await asAdmin.goto('/dashboard');
		const num = async (tid: string) =>
			Number((await asAdmin.getByTestId(tid).textContent()) ?? '0');
		const partition =
			(await num('dash-fully')) + (await num('dash-partially')) + (await num('dash-unscheduled'));
		expect(partition).toBe(3);

		// --- Results page shows the unmet table and an incomplete schedule ---
		await asAdmin.goto('/generate/results');
		const results = asAdmin.getByTestId('results');
		await expect(results).toBeVisible({ timeout: 15000 });
		expect(await results.getAttribute('data-complete')).toBe('false');
		await expect(asAdmin.getByTestId('results-unmet')).toBeVisible();
		// …and why: each short requirement names the preceptor to look at.
		const preceptorName = (
			await kysely
				.selectFrom('preceptors')
				.select('name')
				.where('id', '=', gen.preceptorId)
				.executeTakeFirstOrThrow()
		).name;
		const reasons = asAdmin.getByTestId('results-unmet-reason');
		await expect(reasons.first()).toBeVisible();
		expect(await reasons.count()).toBeGreaterThan(0);
		for (const text of await reasons.allTextContents()) {
			expect(text).toMatch(/of 5 days placed/);
			expect(text).toContain(preceptorName);
			expect(text).toMatch(/no more open days|full or unavailable/);
		}

		// --- Raise the preceptor's capacity, then Completion fills the rest ---
		const bump = await apiOf(asAdmin).patch(`/api/preceptors/${gen.preceptorId}`, {
			max_students: 3
		});
		expect(bump.ok).toBe(true);
		await new GeneratePage(asAdmin).generate('completion');

		// 5 days × capacity 3 = 15 slots; every student's 5 days now placed.
		expect(await assignmentsForSchedule(kysely, gen.scheduleId)).toHaveLength(15);
		const s2 = (await apiOf(asAdmin).get<Summary>('/api/schedule/summary')).data!;
		expect(s2.studentsWithUnmetRequirements.length).toBe(0);
		expect(s2.isComplete).toBe(true);
		await asAdmin.goto('/generate/results');
		await expect(asAdmin.getByTestId('results')).toHaveAttribute('data-complete', 'true', {
			timeout: 15000
		});
		await expect(asAdmin.getByTestId('results-unmet-reasons')).toHaveCount(0);
	});
});
