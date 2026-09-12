/**
 * J5.5 — Configuration → behaviour (e2e plan Phase 5).
 *
 * The Stage 2 configuration surface is entitled, validated, and drives the
 * engine:
 *   - global outpatient defaults round-trip through the API and persist;
 *   - an invalid value is rejected (400) rather than silently stored;
 *   - a preceptor's daily capacity is respected by generation — no preceptor is
 *     placed with more than its limit of students on any date;
 *   - a non-entitled user cannot write the global defaults (403, G-3).
 *
 * The global defaults are per-school shared state, so the round-trip test
 * captures and restores the original values.
 */

import { test, expect, apiOf, assignmentsForSchedule, type Page } from '../../fixtures';
import { generationSandbox } from './helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

const OUTPATIENT = '/api/scheduling-config/global-defaults/outpatient';

test.describe('J5.5 configuration → behaviour', { tag: ['@stage2'] }, () => {
	test('global outpatient defaults persist and reject invalid input', async ({ asAdmin }) => {
		const api = apiOf(asAdmin);
		const original = (await api.get<Record<string, unknown>>(OUTPATIENT)).data!;
		expect(original).toBeTruthy();

		try {
			// Round-trip: change the strategy and per-day cap, read it back.
			const put = await api.put(OUTPATIENT, {
				...original,
				assignmentStrategy: 'daily_rotation',
				defaultMaxStudentsPerDay: 2
			});
			expect(put.ok).toBe(true);
			const after = (await api.get<Record<string, unknown>>(OUTPATIENT)).data!;
			expect(after.assignmentStrategy).toBe('daily_rotation');
			expect(after.defaultMaxStudentsPerDay).toBe(2);

			// Invalid: a non-positive per-day cap is rejected, not stored.
			const bad = await api.put(OUTPATIENT, { ...original, defaultMaxStudentsPerDay: 0 });
			expect(bad.status).toBe(400);
			// The stored value is unchanged (still 2 from the valid write).
			const still = (await api.get<Record<string, unknown>>(OUTPATIENT)).data!;
			expect(still.defaultMaxStudentsPerDay).toBe(2);
		} finally {
			// Restore the shared defaults.
			await api.put(OUTPATIENT, original);
		}
	});

	test("a preceptor's daily capacity is respected by generation", async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const kysely = db as Kysely<DB>;
		// One preceptor at capacity 1/day, 3 available days, 3 students each owing 1
		// day: the only way to place everyone is one per day.
		const gen = await generationSandbox(asAdmin, kysely, {
			requiredDays: 1,
			students: 3,
			maxStudents: 1,
			availabilityDays: 3
		});
		sandbox.register(gen.sandbox);

		expect(
			(
				await apiOf(asAdmin).post('/api/schedules/generate', {
					startDate: gen.sandbox.start,
					endDate: gen.sandbox.end,
					strategy: 'full-reoptimize'
				})
			).ok
		).toBe(true);

		const rows = await assignmentsForSchedule(kysely, gen.scheduleId);
		expect(rows.length).toBeGreaterThan(0);
		// No preceptor exceeds 1 student on any date.
		const perSlot = new Map<string, number>();
		for (const r of rows) {
			const k = `${r.preceptor_id}|${r.date}`;
			perSlot.set(k, (perSlot.get(k) ?? 0) + 1);
		}
		expect(Math.max(...perSlot.values())).toBe(1);
	});

	test('a non-entitled user cannot write the global defaults (403)', async ({ asBasic }) => {
		const res = await apiOf(asBasic).put(OUTPATIENT, {
			assignmentStrategy: 'daily_rotation',
			healthSystemRule: 'no_preference',
			defaultMaxStudentsPerDay: 1,
			defaultMaxStudentsPerYear: 100
		});
		expect(res.status).toBe(403);
	});
});
