/**
 * Strategy Pattern Tests
 *
 * Tests that verify each scheduling strategy produces the expected assignment patterns:
 * - continuous_single: Same preceptor for all days
 * - team_continuity: Primary preceptor with team filling gaps
 * - block_based: Fixed-size blocks with same preceptor per block
 * - daily_rotation: Different preceptor each day
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestStudents,
	createTestPreceptors,
	createTestHealthSystem,
	createCapacityRule,
	createTestTeam,
	clearAllTestData,
	createPreceptorAvailability,
	setOutpatientAssignmentStrategy,
} from '$lib/testing/integration-helpers';
import {
	assertContinuousSingleStrategy,
	assertBlockBasedStrategy,
	assertDailyRotationStrategy,
	assertTeamContinuityStrategy,
	assertNoDateConflicts,
} from '$lib/testing/assertion-helpers';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

// Helper to generate date range
function generateDateRange(startDate: string, days: number): string[] {
	const dates: string[] = [];
	const start = new Date(startDate + 'T00:00:00.000Z');
	for (let i = 0; i < days; i++) {
		const date = new Date(start);
		date.setUTCDate(start.getUTCDate() + i);
		dates.push(date.toISOString().split('T')[0]);
	}
	return dates;
}

describe('Strategy Pattern Tests', () => {
	let db: Kysely<DB>;
	let engine: ConfigurableSchedulingEngine;
	const startDate = '2025-01-06'; // Monday
	const endDate = '2025-02-28';

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		engine = new ConfigurableSchedulingEngine(db);
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('continuous_single strategy', () => {
		it('should assign the same preceptor for all days of a clerkship', async () => {
			// Setup: Create health system, sites, clerkship with continuous_single strategy
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 10 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 5,
				clerkshipId, // Required: associates preceptors with clerkship via team
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create preceptor availability for all dates
			const dates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], dates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Verify assignments were created
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify continuous single strategy pattern
			for (const studentId of studentIds) {
				await assertContinuousSingleStrategy(db, studentId, clerkshipId);
				await assertNoDateConflicts(db, studentId);
			}
		});

		it('should fail gracefully when no preceptor has availability for all required days', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 20 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 5,
			});

			// Only give preceptors 5 days of availability each (not enough)
			const dates1 = generateDateRange(startDate, 5);
			const dates2 = generateDateRange('2025-01-13', 5);
			await createPreceptorAvailability(db, preceptorIds[0], siteIds[0], dates1);
			await createPreceptorAvailability(db, preceptorIds[1], siteIds[0], dates2);

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Should report unmet requirements
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('team_continuity strategy', () => {
		it('should maximize assignments with primary preceptor and fill gaps with team members', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			// Use outpatient which defaults to team_continuity/continuous_single strategy
			const clerkshipId = await createTestClerkship(db, 'Internal Medicine', 'outpatient', { requiredDays: 14 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				clerkshipId, // Associate preceptors with clerkship via team
			});

			// Create a team with 3 members
			await createTestTeam(db, clerkshipId, 'Test Team', preceptorIds);

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Primary preceptor available 10 days, team members fill remaining 4
			const primaryDates = generateDateRange(startDate, 10);
			const teamDates = generateDateRange('2025-01-16', 4);
			await createPreceptorAvailability(db, preceptorIds[0], siteIds[0], primaryDates);
			await createPreceptorAvailability(db, preceptorIds[1], siteIds[0], teamDates);
			await createPreceptorAvailability(db, preceptorIds[2], siteIds[0], teamDates);

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				enableTeamFormation: true,
				dryRun: false,
			});

			// Verify assignments were created
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify team continuity pattern (primary preceptor has majority)
			for (const studentId of studentIds) {
				await assertTeamContinuityStrategy(db, studentId, clerkshipId);
			}
		});

		it('should report unmet requirements when no team is configured', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'Pediatrics', 'outpatient', { requiredDays: 10 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				// Note: NO clerkshipId - preceptors are NOT associated with this clerkship
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create availability for first preceptor only
			const dates = generateDateRange(startDate, 15);
			await createPreceptorAvailability(db, preceptorIds[0], siteIds[0], dates);

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				enableTeamFormation: true,
				dryRun: false,
			});

			// Engine requires team membership to associate preceptors with clerkships
			// Without a team, no preceptors are available, so scheduling fails
			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('block_based strategy', () => {
		it('should create fixed-size blocks with same preceptor per block', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'Surgery', 'inpatient', { requiredDays: 14 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				clerkshipId, // Required: associates preceptors with clerkship via team
			});

			const blockSize = 7;

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create availability for all preceptors
			const dates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], dates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Verify assignments were created
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify block-based pattern
			for (const studentId of studentIds) {
				await assertBlockBasedStrategy(db, studentId, clerkshipId, blockSize);
			}
		});
	});

	describe('daily_rotation strategy', () => {
		it('should assign different preceptors each day', async () => {
			// Configure global defaults to use daily_rotation strategy
			await setOutpatientAssignmentStrategy(db, 'daily_rotation');

			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'Emergency Medicine', 'outpatient', { requiredDays: 10 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 4, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				clerkshipId, // Required: associates preceptors with clerkship via team
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create availability for all preceptors
			const dates = generateDateRange(startDate, 20);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], dates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Verify assignments were created
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify daily rotation pattern (multiple preceptors used)
			for (const studentId of studentIds) {
				await assertDailyRotationStrategy(db, studentId, clerkshipId, 2);
			}
		});
	});

	describe('default strategy behavior', () => {
		it('should use continuous_single as default when no strategy is specified', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'General Practice', 'outpatient', { requiredDays: 10 });
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				clerkshipId, // Required: associates preceptors with clerkship via team
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create availability
			const dates = generateDateRange(startDate, 20);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], dates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Verify assignments were created
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify it used continuous_single (default)
			for (const studentId of studentIds) {
				await assertContinuousSingleStrategy(db, studentId, clerkshipId);
			}
		});
	});

	describe('multiple students scheduling', () => {
		it('should schedule multiple students with same strategy', async () => {
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System');
			const clerkshipId = await createTestClerkship(db, 'OB/GYN', 'outpatient', { requiredDays: 10 });
			const studentIds = await createTestStudents(db, 3);
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 10,
				clerkshipId, // Required: associates preceptors with clerkship via team
			});

			// Set capacity rules allowing multiple students per day
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3, // Allow multiple students
					maxStudentsPerYear: 100,
				});
			}

			// Create availability
			const dates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], dates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Each student should have assignments
			expect(result.assignments.length).toBeGreaterThanOrEqual(studentIds.length * 10);

			// Each student should follow the strategy
			for (const studentId of studentIds) {
				await assertContinuousSingleStrategy(db, studentId, clerkshipId);
				await assertNoDateConflicts(db, studentId);
			}
		});
	});
});
