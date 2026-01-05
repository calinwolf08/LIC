/**
 * Integration Test Suite 11: Fallback-Only Preceptors
 *
 * Tests the fallback-only preceptor feature that allows marking team members
 * as "fallback-only" so they are only used when primary members' capacity is exhausted.
 *
 * Features tested:
 * 1. Team-level is_fallback_only flag on preceptor_team_members
 * 2. Global is_global_fallback_only flag on preceptors table
 * 3. Primary members are used first, fallback-only members used when needed
 * 4. Proper ordering: primary by priority, then fallback by priority
 * 5. Edge cases: capacity exhaustion, all primary exhausted, mixed flags
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestStudents,
	createPreceptorAvailability,
	createTestTeam,
	createTestPreceptor,
	createCapacityRule,
	clearAllTestData,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 11: Fallback-Only Preceptors', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Primary members used first', () => {
		it('should assign to primary members before fallback-only members', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			// Create preceptors
			const primaryPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Primary',
				healthSystemId,
				siteId,
			});

			const fallbackPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Fallback',
				healthSystemId,
				siteId,
			});

			// Create team with primary and fallback-only member
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primaryPreceptor, priority: 1, isFallbackOnly: false },
				{ preceptorId: fallbackPreceptor, priority: 2, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Both preceptors available for all 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, primaryPreceptor, siteId, dates);
			await createPreceptorAvailability(db, fallbackPreceptor, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 5 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All assignments should be to primary preceptor (since they have capacity)
			const primaryCount = result.assignments.filter(a => a.preceptorId === primaryPreceptor).length;
			const fallbackCount = result.assignments.filter(a => a.preceptorId === fallbackPreceptor).length;

			expect(primaryCount).toBe(5);
			expect(fallbackCount).toBe(0);
		});
	});

	describe('Test 2: Fallback used when primary capacity exhausted', () => {
		it('should use fallback-only member when primary has insufficient availability', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			// Create preceptors
			const primaryPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Primary',
				healthSystemId,
				siteId,
			});

			const fallbackPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Fallback',
				healthSystemId,
				siteId,
			});

			// Create team with primary and fallback-only member
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primaryPreceptor, priority: 1, isFallbackOnly: false },
				{ preceptorId: fallbackPreceptor, priority: 2, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Primary only available for 3 days
			await createPreceptorAvailability(db, primaryPreceptor, siteId, ['2025-12-01', '2025-12-02', '2025-12-03']);

			// Fallback available for remaining days
			await createPreceptorAvailability(db, fallbackPreceptor, siteId, ['2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 5 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Primary gets 3 days, fallback gets 2 days
			const primaryCount = result.assignments.filter(a => a.preceptorId === primaryPreceptor).length;
			const fallbackCount = result.assignments.filter(a => a.preceptorId === fallbackPreceptor).length;

			expect(primaryCount).toBe(3);
			expect(fallbackCount).toBe(2);
		});
	});

	describe('Test 3: Multiple primary members before fallback', () => {
		it('should exhaust all primary members before using fallback-only', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 6 });

			// Create preceptors
			const primary1 = await createTestPreceptor(db, {
				name: 'Dr. Primary 1',
				healthSystemId,
				siteId,
			});

			const primary2 = await createTestPreceptor(db, {
				name: 'Dr. Primary 2',
				healthSystemId,
				siteId,
			});

			const fallback = await createTestPreceptor(db, {
				name: 'Dr. Fallback',
				healthSystemId,
				siteId,
			});

			// Create team with two primary members and one fallback
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primary1, priority: 1, isFallbackOnly: false },
				{ preceptorId: primary2, priority: 2, isFallbackOnly: false },
				{ preceptorId: fallback, priority: 3, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Primary 1: available days 1-2
			await createPreceptorAvailability(db, primary1, siteId, ['2025-12-01', '2025-12-02']);

			// Primary 2: available days 3-4
			await createPreceptorAvailability(db, primary2, siteId, ['2025-12-03', '2025-12-04']);

			// Fallback: available days 5-6
			await createPreceptorAvailability(db, fallback, siteId, ['2025-12-05', '2025-12-06']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 6 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(6);

			// Verify distribution
			const p1Count = result.assignments.filter(a => a.preceptorId === primary1).length;
			const p2Count = result.assignments.filter(a => a.preceptorId === primary2).length;
			const fbCount = result.assignments.filter(a => a.preceptorId === fallback).length;

			expect(p1Count).toBe(2);
			expect(p2Count).toBe(2);
			expect(fbCount).toBe(2);
		});
	});

	describe('Test 4: Global fallback-only flag', () => {
		it('should respect is_global_fallback_only on preceptors table', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			// Create preceptors - one regular, one globally marked as fallback-only
			const regularPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Regular',
				healthSystemId,
				siteId,
				isGlobalFallbackOnly: false,
			});

			const globalFallbackPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Global Fallback',
				healthSystemId,
				siteId,
				isGlobalFallbackOnly: true, // Global fallback flag
			});

			// Create team - note: team-level isFallbackOnly is false for both
			// But global flag on preceptor should take precedence
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: regularPreceptor, priority: 1, isFallbackOnly: false },
				{ preceptorId: globalFallbackPreceptor, priority: 2, isFallbackOnly: false },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Both available all 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, regularPreceptor, siteId, dates);
			await createPreceptorAvailability(db, globalFallbackPreceptor, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 5 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All should go to regular preceptor (global fallback used only when needed)
			const regularCount = result.assignments.filter(a => a.preceptorId === regularPreceptor).length;
			const globalFallbackCount = result.assignments.filter(a => a.preceptorId === globalFallbackPreceptor).length;

			expect(regularCount).toBe(5);
			expect(globalFallbackCount).toBe(0);
		});

		it('should use global fallback preceptor when primary exhausted', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			// Create preceptors
			const regularPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Regular',
				healthSystemId,
				siteId,
				isGlobalFallbackOnly: false,
			});

			const globalFallbackPreceptor = await createTestPreceptor(db, {
				name: 'Dr. Global Fallback',
				healthSystemId,
				siteId,
				isGlobalFallbackOnly: true,
			});

			// Create team
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: regularPreceptor, priority: 1, isFallbackOnly: false },
				{ preceptorId: globalFallbackPreceptor, priority: 2, isFallbackOnly: false },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Regular only available 3 days
			await createPreceptorAvailability(db, regularPreceptor, siteId, ['2025-12-01', '2025-12-02', '2025-12-03']);

			// Global fallback available remaining days
			await createPreceptorAvailability(db, globalFallbackPreceptor, siteId, ['2025-12-04', '2025-12-05']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 5 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Verify distribution
			const regularCount = result.assignments.filter(a => a.preceptorId === regularPreceptor).length;
			const globalFallbackCount = result.assignments.filter(a => a.preceptorId === globalFallbackPreceptor).length;

			expect(regularCount).toBe(3);
			expect(globalFallbackCount).toBe(2);
		});
	});

	describe('Test 5: Priority ordering within fallback-only members', () => {
		it('should use fallback members in priority order when needed', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 4 });

			// Create preceptors
			const primary = await createTestPreceptor(db, {
				name: 'Dr. Primary',
				healthSystemId,
				siteId,
			});

			const fallback1 = await createTestPreceptor(db, {
				name: 'Dr. Fallback Priority 2',
				healthSystemId,
				siteId,
			});

			const fallback2 = await createTestPreceptor(db, {
				name: 'Dr. Fallback Priority 3',
				healthSystemId,
				siteId,
			});

			// Create team with one primary and two fallback-only members
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primary, priority: 1, isFallbackOnly: false },
				{ preceptorId: fallback1, priority: 2, isFallbackOnly: true },
				{ preceptorId: fallback2, priority: 3, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Primary: 2 days
			await createPreceptorAvailability(db, primary, siteId, ['2025-12-01', '2025-12-02']);

			// Fallback 1 (priority 2): days 3-4
			await createPreceptorAvailability(db, fallback1, siteId, ['2025-12-03', '2025-12-04']);

			// Fallback 2 (priority 3): also available days 3-4 (but lower priority)
			await createPreceptorAvailability(db, fallback2, siteId, ['2025-12-03', '2025-12-04']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 4 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(4);

			// Primary: 2 days, Fallback 1 (higher priority): 2 days, Fallback 2: 0 days
			const primaryCount = result.assignments.filter(a => a.preceptorId === primary).length;
			const fb1Count = result.assignments.filter(a => a.preceptorId === fallback1).length;
			const fb2Count = result.assignments.filter(a => a.preceptorId === fallback2).length;

			expect(primaryCount).toBe(2);
			expect(fb1Count).toBe(2);
			expect(fb2Count).toBe(0);
		});
	});

	describe('Test 6: Insufficient primary coverage triggers fallback', () => {
		it('should fill gaps with fallback when primary cannot cover all days', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			// Create preceptors
			const primary = await createTestPreceptor(db, {
				name: 'Dr. Primary',
				healthSystemId,
				siteId,
			});

			const fallback = await createTestPreceptor(db, {
				name: 'Dr. Fallback',
				healthSystemId,
				siteId,
			});

			// Create team
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primary, priority: 1, isFallbackOnly: false },
				{ preceptorId: fallback, priority: 2, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Primary: available Mon, Wed, Fri (gaps on Tue, Thu)
			await createPreceptorAvailability(db, primary, siteId, ['2025-12-01', '2025-12-03', '2025-12-05']);

			// Fallback: available Tue, Thu (fills the gaps)
			await createPreceptorAvailability(db, fallback, siteId, ['2025-12-02', '2025-12-04']);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 5 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Primary: 3 days, Fallback: 2 days
			const primaryCount = result.assignments.filter(a => a.preceptorId === primary).length;
			const fallbackCount = result.assignments.filter(a => a.preceptorId === fallback).length;

			expect(primaryCount).toBe(3);
			expect(fallbackCount).toBe(2);

			// Verify specific date assignments
			const primaryDates = result.assignments
				.filter(a => a.preceptorId === primary)
				.map(a => a.date)
				.sort();
			const fallbackDates = result.assignments
				.filter(a => a.preceptorId === fallback)
				.map(a => a.date)
				.sort();

			expect(primaryDates).toEqual(['2025-12-01', '2025-12-03', '2025-12-05']);
			expect(fallbackDates).toEqual(['2025-12-02', '2025-12-04']);
		});
	});

	describe('Test 7: All primary members at capacity', () => {
		it('should use fallback-only when all primary members are at yearly capacity', async () => {
			// Setup
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 3 });

			// Create preceptors
			const primary = await createTestPreceptor(db, {
				name: 'Dr. Primary',
				healthSystemId,
				siteId,
			});

			const fallback = await createTestPreceptor(db, {
				name: 'Dr. Fallback',
				healthSystemId,
				siteId,
			});

			// Primary has yearly capacity of 1 student
			await createCapacityRule(db, primary, {
				maxStudentsPerDay: 10,
				maxStudentsPerYear: 1, // Very limited yearly capacity
			});

			// Fallback has normal capacity
			await createCapacityRule(db, fallback, {
				maxStudentsPerDay: 10,
				maxStudentsPerYear: 100,
			});

			// Create team
			await createTestTeam(db, clerkshipId, 'Team A', [
				{ preceptorId: primary, priority: 1, isFallbackOnly: false },
				{ preceptorId: fallback, priority: 2, isFallbackOnly: true },
			]);

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Both available all 3 days
			const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
			await createPreceptorAvailability(db, primary, siteId, dates);
			await createPreceptorAvailability(db, fallback, siteId, dates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				enableFallbacks: true,
				dryRun: false,
			});

			// Should succeed with 3 assignments
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(3);

			// Primary: 1 day (yearly capacity limit), Fallback: 2 days
			const primaryCount = result.assignments.filter(a => a.preceptorId === primary).length;
			const fallbackCount = result.assignments.filter(a => a.preceptorId === fallback).length;

			expect(primaryCount).toBe(1);
			expect(fallbackCount).toBe(2);
		});
	});
});
