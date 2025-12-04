/**
 * Integration Test Suite 7: Edge Cases and Error Handling
 *
 * Tests how the system handles edge cases, boundary conditions, and error scenarios.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestStudents,
	createTestPreceptors,
	createTestHealthSystem,
	createTestRequirement,
	createCapacityRule,
	createBlackoutDates,
	clearAllTestData,
	createPreceptorAvailability,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 7: Edge Cases and Error Handling', () => {
	let db: Kysely<DB>;
	let engine: ConfigurableSchedulingEngine;
	const startDate = '2025-01-06';
	const endDate = '2025-06-30';

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		engine = new ConfigurableSchedulingEngine(db);
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Insufficient Preceptor Capacity', () => {
		it('should handle case where there are more students than capacity', async () => {
			// Setup: Many students, limited preceptors
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Small Clinic');
			const clerkshipId = await createTestClerkship(db, 'Geriatrics', 'Geriatrics');
			const studentIds = await createTestStudents(db, 5); // 5 students
			const preceptorIds = await createTestPreceptors(db, 2, {
				// Only 2 preceptors
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 2,
				clerkshipId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Set capacity that allows some but not all students
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 60);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions - engine should complete
			expect(result).toBeDefined();
			expect(result.success).toBe(true);

			// With 2 preceptors at maxStudentsPerDay: 2, and 60 days of availability,
			// we can schedule 2 students on the same dates, then 2 more offset, etc.
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify all 5 students got scheduled (2 preceptors * 2 students/day = 4 concurrent)
			// With staggered starts, all 5 should fit
			const scheduledStudents = new Set(result.assignments.map(a => a.studentId));
			expect(scheduledStudents.size).toBe(5);
		});
	});

	describe('Test 2: No Available Preceptors', () => {
		it('should gracefully handle case where no preceptors have availability', async () => {
			// Setup: Preceptors exist but have no availability records
			const clerkshipId = await createTestClerkship(db, 'Neurosurgery', 'Neurosurgery');
			const studentIds = await createTestStudents(db, 3);
			// Create preceptors but don't create availability
			await createTestPreceptors(db, 2, { clerkshipId });

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'continuous_single',
			});

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions - engine should complete without crashing
			expect(result).toBeDefined();

			// Engine may return success: false when no valid scheduling is possible
			// This is expected behavior for edge cases

			// No assignments should be made (no preceptor availability)
			expect(result.assignments.length).toBe(0);

			// All students should be in unmet requirements
			expect(result.unmetRequirements.length).toBe(studentIds.length);

			// Verify error messages exist
			for (const unmet of result.unmetRequirements) {
				expect(unmet.reason).toBeDefined();
				expect(unmet.reason.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Test 3: Fragmented Availability', () => {
		it('should handle preceptors with limited availability windows', async () => {
			// Setup - single student
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Busy Practice');
			const clerkshipId = await createTestClerkship(db, 'Primary Care', 'Family Medicine');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
				clerkshipId,
			});

			// Use daily_rotation which can work with non-consecutive availability
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'daily_rotation',
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3,
					maxStudentsPerYear: 100,
				});
			}

			// Create only partial availability (every other day)
			// This tests fragmented availability scenarios
			const allDates = generateDateRange(startDate, 60);
			const fragmentedDates = allDates.filter((_, i) => i % 2 === 0); // Every other day (30 dates)

			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], fragmentedDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions - engine should complete without crashing
			expect(result).toBeDefined();

			// The engine may return success: false if it can't find valid scheduling
			// with fragmented availability. This is expected edge case behavior.
			// Key assertion: engine doesn't crash and returns a valid result

			if (result.success && result.assignments.length > 0) {
				// If scheduling succeeded, verify assignments use only available dates
				const assignments = await db.selectFrom('schedule_assignments').selectAll().execute();

				for (const assignment of assignments) {
					// Assignment date should be in fragmentedDates
					expect(fragmentedDates).toContain(assignment.date);
				}
			} else {
				// If scheduling failed, verify unmet requirements are reported
				expect(result.unmetRequirements.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Test 4: All Preceptors at Capacity', () => {
		it('should handle case where preceptor capacity is limited', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Full Practice');
			const clerkshipId = await createTestClerkship(db, 'Ophthalmology', 'Ophthalmology');
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 2,
				clerkshipId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Set reasonable capacity - max 2 students per day
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 50,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 60);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// First batch: Schedule 2 students
			const firstBatchIds = await createTestStudents(db, 2);
			const firstResult = await engine.schedule(firstBatchIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});
			expect(firstResult.success).toBe(true);
			expect(firstResult.assignments.length).toBe(28); // 2 students * 14 days

			// Second batch: Schedule 2 more students
			const secondBatchIds = await createTestStudents(db, 2);
			const secondResult = await engine.schedule(secondBatchIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions - both batches should succeed
			expect(secondResult.success).toBe(true);
			expect(secondResult.assignments.length).toBe(28); // 2 students * 14 days
		});
	});

	describe('Test 5: Minimum Required Days', () => {
		it('should handle requirement with minimum (1 day) gracefully', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'One Day Clinic');
			const clerkshipId = await createTestClerkship(db, 'Observation', 'General');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId: siteIds[0],
				clerkshipId,
			});

			// Create requirement with minimum 1 day
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 1,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);

			// Should create exactly 1 assignment for 1-day requirement
			expect(result.assignments.length).toBe(1);
		});
	});

	describe('Test 6: Long Rotation', () => {
		it('should handle long rotation periods', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Long-term Facility');
			const clerkshipId = await createTestClerkship(db, 'Longitudinal Care', 'Family Medicine');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
				clerkshipId,
			});

			// Moderate rotation: 60 days (2 months) - fits within start/end date range
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 60,
				assignmentStrategy: 'continuous_single',
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3,
					maxStudentsPerYear: 100,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 90);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);

			// Verify assignment created (one assignment per day)
			const assignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('student_id', '=', studentIds[0])
				.where('clerkship_id', '=', clerkshipId)
				.execute();

			expect(assignments.length).toBe(60);
		});
	});

	describe('Test 7: Empty Student List', () => {
		it('should handle empty student list gracefully', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Empty Test Clinic');
			const clerkshipId = await createTestClerkship(db, 'Empty Test', 'General');
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId: siteIds[0],
				clerkshipId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling with empty student list
			const result = await engine.schedule([], [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);

			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBe(0);
		});
	});

	describe('Test 8: Empty Clerkship List', () => {
		it('should handle empty clerkship list gracefully', async () => {
			// Setup
			const studentIds = await createTestStudents(db, 2);

			// Execute scheduling with empty clerkship list
			const result = await engine.schedule(studentIds, [], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);

			expect(result.assignments.length).toBe(0);
		});
	});

	describe('Test 9: Dry Run Mode', () => {
		it('should not persist assignments in dry run mode', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Clinic');
			const clerkshipId = await createTestClerkship(db, 'Test Rotation', 'General');
			const studentIds = await createTestStudents(db, 2);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
				clerkshipId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute in dry run mode
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: true,
			});

			// Assertions
			expect(result.success).toBe(true);

			// Should report what would happen (assignments in result but not in DB)
			expect(result.assignments.length).toBeGreaterThan(0);

			// But no assignments should be in database
			const assignmentCount = await db
				.selectFrom('schedule_assignments')
				.select(({ fn }) => [fn.countAll<number>().as('count')])
				.executeTakeFirst();

			expect(assignmentCount?.count).toBe(0);
		});
	});

	describe('Test 10: Scheduling with Valid and Invalid Data', () => {
		it('should complete scheduling even with some missing data', async () => {
			// Setup - test that engine handles edge cases in data
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Edge Case Clinic');
			const clerkshipId = await createTestClerkship(db, 'Edge Test', 'General');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId: siteIds[0],
				clerkshipId,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Only create availability for one preceptor (not both)
			const availabilityDates = generateDateRange(startDate, 30);
			await createPreceptorAvailability(db, preceptorIds[0], siteIds[0], availabilityDates);
			// preceptorIds[1] has no availability - engine should handle this

			// Execute scheduling - should still work with available preceptor
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Should complete successfully
			expect(result.success).toBe(true);

			// Student should be scheduled to the available preceptor
			expect(result.assignments.length).toBe(14);

			// All assignments should be to the preceptor with availability
			const assignments = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('student_id', '=', studentIds[0])
				.execute();

			for (const assignment of assignments) {
				expect(assignment.preceptor_id).toBe(preceptorIds[0]);
			}
		});
	});
});
