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
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 7: Edge Cases and Error Handling', () => {
	let db: Kysely<DB>;
	let engine: ConfigurableSchedulingEngine;

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
			const studentIds = await createTestStudents(db, 10); // 10 students
			const preceptorIds = await createTestPreceptors(db, 2, {
				// Only 2 preceptors
				specialty: 'Geriatrics',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 2,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 20,
				assignmentStrategy: 'continuous_single',
			});

			// Very strict capacity: max 1 student per day
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 1,
					maxStudentsPerYear: 3, // Can only handle 3 students per year
				});
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			// Should schedule some students (up to capacity)
			expect(result.statistics.studentsScheduled).toBeGreaterThan(0);
			expect(result.statistics.studentsScheduled).toBeLessThan(10); // Can't schedule all 10

			// Should have unmet requirements reported
			expect(result.unmetRequirements.length).toBeGreaterThan(0);

			// Verify error messages are helpful
			for (const unmet of result.unmetRequirements) {
				expect(unmet.reason).toBeDefined();
				expect(unmet.reason.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Test 2: No Available Preceptors', () => {
		it('should gracefully handle case where no preceptors match requirements', async () => {
			// Setup: Students need specialty with no preceptors
			const clerkshipId = await createTestClerkship(db, 'Neurosurgery', 'Neurosurgery');
			const studentIds = await createTestStudents(db, 3);
			// Create preceptors but wrong specialty
			await createTestPreceptors(db, 2, { specialty: 'Cardiology' });

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'continuous_single',
			});

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true); // Engine runs successfully even if no assignments
			if (!result.success) return;

			// No students should be scheduled
			expect(result.statistics.studentsScheduled).toBe(0);
			expect(result.statistics.totalAssignments).toBe(0);

			// All students should be in unmet requirements
			expect(result.unmetRequirements.length).toBe(studentIds.length);

			// Verify helpful error messages
			for (const unmet of result.unmetRequirements) {
				expect(unmet.reason).toBeDefined();
				expect(unmet.reason).toContain('preceptor');
			}
		});
	});

	describe('Test 3: Fragmented Availability', () => {
		it('should handle preceptors with many blackout dates', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Busy Practice');
			const clerkshipId = await createTestClerkship(db, 'Primary Care', 'Family Medicine');
			const studentIds = await createTestStudents(db, 2);
			const preceptorIds = await createTestPreceptors(db, 3, {
				specialty: 'Family Medicine',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single', // Continuous might fail with fragmented availability
			});

			// Create lots of blackout dates (fragmented availability)
			const today = new Date();
			for (let i = 0; i < preceptorIds.length; i++) {
				const blackouts = [];
				// Every other week is blacked out
				for (let week = 0; week < 8; week += 2) {
					const start = new Date(today);
					start.setDate(start.getDate() + week * 7);
					const end = new Date(start);
					end.setDate(end.getDate() + 6);
					blackouts.push({ start, end, reason: 'Conference/Vacation' });
				}
				await createBlackoutDates(db, preceptorIds[i], blackouts);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			// Some students might be scheduled if engine can find continuous blocks
			// But this is a difficult scenario
			if (result.statistics.studentsScheduled > 0) {
				// Verify assignments don't conflict with blackout dates
				const assignments = await db.selectFrom('assignments').selectAll().execute();

				for (const assignment of assignments) {
					const assignmentStart = new Date(assignment.start_date);
					const assignmentEnd = new Date(assignment.end_date);

					// Get blackout dates for this preceptor
					const blackouts = await db
						.selectFrom('blackout_dates')
						.selectAll()
						.where('preceptor_id', '=', assignment.preceptor_id)
						.execute();

					// Verify assignment doesn't overlap with any blackout
					for (const blackout of blackouts) {
						const blackoutStart = new Date(blackout.start_date);
						const blackoutEnd = new Date(blackout.end_date);
						const hasOverlap = assignmentStart <= blackoutEnd && blackoutStart <= assignmentEnd;
						expect(hasOverlap).toBe(false);
					}
				}
			}
		});
	});

	describe('Test 4: All Preceptors at Capacity', () => {
		it('should handle case where all preceptors are fully booked', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Full Practice');
			const clerkshipId = await createTestClerkship(db, 'Ophthalmology', 'Ophthalmology');
			const preceptorIds = await createTestPreceptors(db, 2, {
				specialty: 'Ophthalmology',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 2,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Set capacity to 2 students per year
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 1,
					maxStudentsPerYear: 2,
				});
			}

			// First batch: Fill capacity with 4 students (2 per preceptor)
			const firstBatchIds = await createTestStudents(db, 4);
			const firstResult = await engine.schedule(firstBatchIds, [clerkshipId], {
				dryRun: false,
			});
			expect(firstResult.success).toBe(true);

			// Second batch: Try to schedule more students when capacity is full
			const secondBatchIds = await createTestStudents(db, 2);
			const secondResult = await engine.schedule(secondBatchIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(secondResult.success).toBe(true);
			if (!secondResult.success) return;

			// Second batch should have unmet requirements (no capacity left)
			expect(secondResult.unmetRequirements.length).toBeGreaterThan(0);

			// Verify helpful error messages mentioning capacity
			const hasCapacityMessage = secondResult.unmetRequirements.some((unmet) =>
				unmet.reason.toLowerCase().includes('capacity')
			);
			expect(hasCapacityMessage).toBe(true);
		});
	});

	describe('Test 5: Zero Required Days', () => {
		it('should handle requirement with zero days gracefully', async () => {
			// Setup
			const clerkshipId = await createTestClerkship(db, 'Observation', 'General');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 1, { specialty: 'General' });

			// Create requirement with 0 days (edge case)
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 0,
				assignmentStrategy: 'continuous_single',
			});

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			// Should not create any assignments for 0-day requirement
			expect(result.statistics.totalAssignments).toBe(0);
		});
	});

	describe('Test 6: Extremely Long Rotation', () => {
		it('should handle very long rotation periods', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Long-term Facility');
			const clerkshipId = await createTestClerkship(db, 'Longitudinal Care', 'Family Medicine');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 2, {
				specialty: 'Family Medicine',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			// Very long rotation: 180 days (6 months)
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 180,
				assignmentStrategy: 'continuous_single',
			});

			// Execute scheduling
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			if (result.statistics.studentsScheduled > 0) {
				// Verify assignment created
				const assignments = await db
					.selectFrom('assignments')
					.selectAll()
					.where('student_id', '=', studentIds[0])
					.where('clerkship_id', '=', clerkshipId)
					.execute();

				expect(assignments.length).toBeGreaterThan(0);

				// Calculate total days
				let totalDays = 0;
				for (const assignment of assignments) {
					const start = new Date(assignment.start_date);
					const end = new Date(assignment.end_date);
					const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
					totalDays += days;
				}

				expect(totalDays).toBe(180);
			}
		});
	});

	describe('Test 7: Empty Student List', () => {
		it('should handle empty student list gracefully', async () => {
			// Setup
			const clerkshipId = await createTestClerkship(db, 'Empty Test', 'General');
			await createTestPreceptors(db, 1, { specialty: 'General' });

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Execute scheduling with empty student list
			const result = await engine.schedule([], [clerkshipId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(0);
			expect(result.statistics.totalAssignments).toBe(0);
			expect(result.unmetRequirements.length).toBe(0);
		});
	});

	describe('Test 8: Empty Clerkship List', () => {
		it('should handle empty clerkship list gracefully', async () => {
			// Setup
			const studentIds = await createTestStudents(db, 2);

			// Execute scheduling with empty clerkship list
			const result = await engine.schedule(studentIds, [], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(0);
			expect(result.statistics.totalAssignments).toBe(0);
		});
	});

	describe('Test 9: Dry Run Mode', () => {
		it('should not persist assignments in dry run mode', async () => {
			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Clinic');
			const clerkshipId = await createTestClerkship(db, 'Test Rotation', 'General');
			const studentIds = await createTestStudents(db, 2);
			const preceptorIds = await createTestPreceptors(db, 2, {
				specialty: 'General',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Execute in dry run mode
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: true,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			// Should report what would happen
			expect(result.statistics.studentsScheduled).toBeGreaterThan(0);

			// But no assignments should be in database
			const assignmentCount = await db
				.selectFrom('assignments')
				.select(({ fn }) => [fn.countAll<number>().as('count')])
				.executeTakeFirst();

			expect(assignmentCount?.count).toBe(0);
		});
	});

	describe('Test 10: Invalid Preceptor ID in Database', () => {
		it('should handle orphaned data gracefully', async () => {
			// Setup
			const clerkshipId = await createTestClerkship(db, 'Orphan Test', 'General');
			const studentIds = await createTestStudents(db, 1);
			const preceptorIds = await createTestPreceptors(db, 1, { specialty: 'General' });

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Create a capacity rule with invalid preceptor ID
			await createCapacityRule(db, 'non-existent-preceptor-id', {
				maxStudentsPerDay: 2,
				clerkshipId,
			});

			// Execute scheduling - should still work with valid preceptor
			const result = await engine.schedule(studentIds, [clerkshipId], {
				dryRun: false,
			});

			// Should complete without crashing
			expect(result.success).toBe(true);
		});
	});
});
