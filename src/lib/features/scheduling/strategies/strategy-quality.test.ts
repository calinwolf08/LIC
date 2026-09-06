/**
 * Phase 3 strategy-quality tests (pure, no DB): block-based sliding windows +
 * daily capacity + partial results (F-15, F-16, F-21) and daily-rotation partials.
 */

import { describe, it, expect } from 'vitest';
import { BlockBasedStrategy } from './block-based.strategy';
import { DailyRotationStrategy } from './daily-rotation.strategy';
import type { StrategyContext } from './base-strategy';
import type { ResolvedRequirementConfiguration } from '$lib/features/scheduling-config/types';

type Preceptor = StrategyContext['availablePreceptors'][number];

function preceptor(id: string, availability: string[], maxPerDay = 1): Preceptor {
	return {
		id,
		name: id,
		healthSystemId: 'hs-1',
		siteId: 'site-1',
		siteIds: ['site-1'],
		availability,
		currentAssignmentCount: 0,
		maxStudentsPerDay: maxPerDay,
		maxStudentsPerYear: 1000
	};
}

function context(
	config: Partial<ResolvedRequirementConfiguration>,
	availableDates: string[],
	preceptors: Preceptor[],
	assignmentsByPreceptorDate?: Map<string, Map<string, number>>
): StrategyContext {
	return {
		student: { id: 'stu-1', name: 'Stu' } as StrategyContext['student'],
		clerkship: { id: 'clerk-1', name: 'Med', required_days: 10 } as StrategyContext['clerkship'],
		config: {
			clerkshipId: 'clerk-1',
			requirementType: 'inpatient',
			requiredDays: 4,
			assignmentStrategy: 'block_based',
			healthSystemRule: 'no_preference',
			maxStudentsPerDay: 1,
			maxStudentsPerYear: 1000,
			allowTeams: false,
			allowFallbacks: false,
			fallbackRequiresApproval: false,
			fallbackAllowCrossSystem: false,
			source: 'global_defaults',
			...config
		} as ResolvedRequirementConfiguration,
		availableDates,
		availablePreceptors: preceptors,
		teams: undefined,
		existingAssignments: [],
		healthSystems: new Map(),
		sites: new Map(),
		assignmentsByPreceptorDate: assignmentsByPreceptorDate ?? new Map()
	};
}

const WEEK1 = ['2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05', '2025-06-06'];

describe('BlockBasedStrategy (Phase 3.1)', () => {
	it("slides the block over the preceptor's actual available days (F-15)", async () => {
		// Range starts 2025-06-01 (a Sunday-ish) but the preceptor is only available
		// on the weekdays; the old calendar-slice logic returned 0 here.
		const range = ['2025-06-01', ...WEEK1];
		const ctx = context({ requiredDays: 4, blockSizeDays: 4 }, range, [preceptor('p1', WEEK1)]);
		const result = await new BlockBasedStrategy().generateAssignments(ctx);
		expect(result.success).toBe(true);
		expect(result.assignments).toHaveLength(4);
		// All placed on days the preceptor is actually available.
		expect(result.assignments.every((a) => WEEK1.includes(a.date))).toBe(true);
	});

	it('respects daily capacity from pending assignments (F-16)', async () => {
		// p1 is max 1/day and already has a pending student on 06-02; that day must
		// not be used, so a 4-day block draws from the remaining available days.
		const pending = new Map([['p1', new Map([['2025-06-02', 1]])]]);
		const ctx = context(
			{ requiredDays: 4, blockSizeDays: 4 },
			WEEK1,
			[preceptor('p1', WEEK1, 1)],
			pending
		);
		const result = await new BlockBasedStrategy().generateAssignments(ctx);
		expect(result.assignments.some((a) => a.date === '2025-06-02')).toBe(false);
		expect(result.assignments).toHaveLength(4);
	});

	it('returns the best partial with a reason when it cannot fill everything (F-21)', async () => {
		// Only 2 available days but 4 required → partial result, not discarded.
		const ctx = context(
			{ requiredDays: 4, blockSizeDays: 2, allowPartialBlocks: true },
			['2025-06-02', '2025-06-03'],
			[preceptor('p1', ['2025-06-02', '2025-06-03'])]
		);
		const result = await new BlockBasedStrategy().generateAssignments(ctx);
		expect(result.success).toBe(false);
		expect(result.assignments).toHaveLength(2);
		expect(result.error).toBeTruthy();
	});
});

describe('DailyRotationStrategy (Phase 3.2)', () => {
	it('returns a partial result instead of discarding when short on days (F-21)', async () => {
		const ctx = context(
			{ requiredDays: 4, assignmentStrategy: 'daily_rotation' },
			['2025-06-02', '2025-06-03'],
			[preceptor('p1', ['2025-06-02', '2025-06-03'])]
		);
		const result = await new DailyRotationStrategy().generateAssignments(ctx);
		expect(result.success).toBe(false);
		expect(result.assignments).toHaveLength(2);
		expect(result.error).toBeTruthy();
	});
});
