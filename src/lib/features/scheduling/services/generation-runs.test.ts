/**
 * Phase 4.1: generation_runs persistence (F-24 audit) and latest-run read (F-25).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { recordGenerationRun, getLatestGenerationRun } from './audit-service';

const SCHED = 'sched-1';

describe('generation_runs', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		const ts = new Date().toISOString();
		await db
			.insertInto('scheduling_periods')
			.values({
				id: SCHED,
				name: 'Demo',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				created_at: ts,
				updated_at: ts
			})
			.execute();
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('persists a run and reads it back with parsed JSON', async () => {
		const id = await recordGenerationRun(db, {
			scheduleId: SCHED,
			userId: 'user-1',
			mode: 'full-reoptimize',
			preview: false,
			success: true,
			durationMs: 42,
			options: {
				startDate: '2025-06-01',
				endDate: '2025-06-30',
				bypassedConstraints: ['not_onboarded']
			},
			plan: { deletedFuture: 3, preservedFuture: 2 },
			result: {
				statistics: { totalStudents: 5 },
				unmetRequirements: [],
				violations: [{ code: 'x' }]
			}
		});
		expect(id).toBeTruthy();

		const latest = await getLatestGenerationRun(db, SCHED);
		expect(latest).not.toBeNull();
		expect(latest!.mode).toBe('full-reoptimize');
		expect(latest!.userId).toBe('user-1');
		expect(latest!.success).toBe(true);
		expect(latest!.durationMs).toBe(42);
		expect(latest!.options.bypassedConstraints).toEqual(['not_onboarded']);
		expect(latest!.plan.deletedFuture).toBe(3);
		expect(latest!.result.violations).toHaveLength(1);
	});

	it('ignores preview runs and returns the most recent non-preview run', async () => {
		await recordGenerationRun(db, {
			scheduleId: SCHED,
			mode: 'full-reoptimize',
			preview: false,
			success: true,
			durationMs: 1,
			options: {},
			plan: {},
			result: { marker: 'first' }
		});
		await new Promise((r) => setTimeout(r, 5));
		await recordGenerationRun(db, {
			scheduleId: SCHED,
			mode: 'completion',
			preview: true, // preview must be ignored
			success: true,
			durationMs: 1,
			options: {},
			plan: {},
			result: { marker: 'preview' }
		});
		await new Promise((r) => setTimeout(r, 5));
		await recordGenerationRun(db, {
			scheduleId: SCHED,
			mode: 'minimal-change',
			preview: false,
			success: false,
			durationMs: 1,
			options: {},
			plan: {},
			result: { marker: 'second' }
		});

		const latest = await getLatestGenerationRun(db, SCHED);
		expect(latest!.mode).toBe('minimal-change');
		expect(latest!.result.marker).toBe('second');
	});

	it('returns null when the schedule has no runs', async () => {
		expect(await getLatestGenerationRun(db, 'other')).toBeNull();
	});
});
