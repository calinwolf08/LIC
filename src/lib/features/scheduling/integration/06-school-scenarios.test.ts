/**
 * Integration Test Suite 6: School Scenarios End-to-End
 *
 * Tests complete realistic medical school scenarios with full configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestStudents,
	createTestPreceptors,
	createTestHealthSystem,
	// createTestRequirement, // No longer needed - now a no-op
	createCapacityRule,
	createTestTeam,
	createFallbackChain,
	getStudentAssignments,
	clearAllTestData,
	createPreceptorAvailability,
	generateDateRange,
	setOutpatientAssignmentStrategy,
} from '$lib/testing/integration-helpers';
import {
	assertStudentHasCompleteAssignments,
	assertContinuousSingleStrategy,
	assertBlockBasedStrategy,
	assertNoCapacityViolations,
	assertHealthSystemContinuity,
	assertNoDateConflicts,
	assertTeamBalanced,
} from '$lib/testing/assertion-helpers';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 6: School Scenarios End-to-End', () => {
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

	describe('Scenario 1: Traditional Medical School', () => {
		it('should schedule using continuous single preceptor model', async () => {
			// School A: Traditional model - single clerkship test
			// - All rotations use continuous single preceptor
			// - Strong emphasis on health system continuity
			// - Students stay with one preceptor per clerkship

			// Setup health system
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'University Medical Center',
				1
			);

			// Create single clerkship for simplified testing
			const famMedId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine', { requiredDays: 20 });

			// Create students
			const studentIds = await createTestStudents(db, 5);

			// Create preceptors
			const preceptorIds = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 5,
				clerkshipId: famMedId,
			});

			// createTestRequirement is now a no-op - configuration moved to createTestClerkship
			// await createTestRequirement(db, famMedId, {
			// 	requirementType: 'outpatient',
			// 	requiredDays: 20,
			// 	assignmentStrategy: 'continuous_single',
			// 	healthSystemRule: 'prefer_same_system',
			// });

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 5,
					maxStudentsPerYear: 100,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 60);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(
				studentIds,
				[famMedId],
				{
					startDate,
					endDate,
					dryRun: false,
				}
			);

			// Assertions
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify each student has continuous single assignments
			for (const studentId of studentIds) {
				await assertStudentHasCompleteAssignments(db, studentId, famMedId, 20);
				await assertContinuousSingleStrategy(db, studentId, famMedId);
				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 2: Team-Based Medical School', () => {
		it('should schedule using pre-configured teaching teams', async () => {
			// School B: Team-based model - single clerkship test
			// - Students assigned to teams, not individual preceptors
			// - Balanced distribution across team members

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Teaching Hospital',
				1
			);

			// Create clerkship
			const obId = await createTestClerkship(db, 'Obstetrics', 'Obstetrics', { requiredDays: 14 });

			// Create students
			const studentIds = await createTestStudents(db, 4);

			// Create preceptors for team
			const obTeam = await createTestPreceptors(db, 3, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 4,
			});

			// createTestRequirement is now a no-op - configuration moved to createTestClerkship
			// await createTestRequirement(db, obId, {
			// 	requirementType: 'inpatient',
			// 	requiredDays: 14,
			// 	assignmentStrategy: 'team_continuity',
			// });

			// Create team
			const obTeamId = await createTestTeam(db, obId, 'OB Teaching Team', obTeam, {
				requireSameHealthSystem: true,
				requireSameSpecialty: true,
			});

			// Create preceptor availability for all preceptors
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of obTeam) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [obId], {
				startDate,
				endDate,
				enableTeamFormation: true,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify team assignments
			for (const studentId of studentIds) {
				await assertStudentHasCompleteAssignments(db, studentId, obId, 14);
				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 3: Block-Based Strategy', () => {
		it('should create fixed-size blocks for inpatient rotation', async () => {
			// Single clerkship with block-based strategy

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Comprehensive Medical Center',
				1
			);

			// Create clerkship
			const psychiatryId = await createTestClerkship(db, 'Psychiatry', 'Psychiatry', { requiredDays: 14 });

			// Create students
			const studentIds = await createTestStudents(db, 4);

			// Create preceptors
			const preceptorIds = await createTestPreceptors(db, 4, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 4,
				clerkshipId: psychiatryId,
			});

			// createTestRequirement is now a no-op - configuration moved to createTestClerkship
			// await createTestRequirement(db, psychiatryId, {
			// 	requirementType: 'inpatient',
			// 	requiredDays: 14,
			// 	assignmentStrategy: 'block_based',
			// 	blockSizeDays: 7,
			// });

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 4,
					maxStudentsPerYear: 100,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [psychiatryId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify each student has complete assignments
			for (const studentId of studentIds) {
				await assertStudentHasCompleteAssignments(db, studentId, psychiatryId, 14);
				await assertBlockBasedStrategy(db, studentId, psychiatryId, 7);
				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 4: Daily Rotation Strategy', () => {
		it('should rotate students across different preceptors daily', async () => {
			// Daily rotation strategy test
			// Configure global defaults to use daily_rotation strategy
			await setOutpatientAssignmentStrategy(db, 'daily_rotation');

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Regional Network', 1);

			// Create clerkship
			const emergencyId = await createTestClerkship(db, 'Emergency Medicine', 'outpatient', { requiredDays: 14 });

			// Create students (small group)
			const studentIds = await createTestStudents(db, 3);

			// Create preceptors
			const preceptorIds = await createTestPreceptors(db, 4, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
				clerkshipId: emergencyId,
			});

			// createTestRequirement is now a no-op - configuration moved to createTestClerkship
			// await createTestRequirement(db, emergencyId, {
			// 	requirementType: 'inpatient',
			// 	requiredDays: 14,
			// 	assignmentStrategy: 'daily_rotation',
			// });

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3,
					maxStudentsPerYear: 100,
				});
			}

			// Create preceptor availability
			const availabilityDates = generateDateRange(startDate, 30);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [emergencyId], {
				startDate,
				endDate,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify each student has assignments using multiple preceptors
			for (const studentId of studentIds) {
				const assignments = await getStudentAssignments(db, studentId);
				const emergencyAssignments = assignments.filter((a) => a.clerkship_id === emergencyId);

				expect(emergencyAssignments.length).toBe(14);

				// Should use multiple preceptors (daily rotation)
				const preceptorSet = new Set(emergencyAssignments.map((a) => a.preceptor_id));
				expect(preceptorSet.size).toBeGreaterThan(1);

				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 5: Large Scale Single Clerkship', () => {
		it('should schedule many students across a single clerkship efficiently', async () => {
			// Large scale test with 20 students in a single clerkship
			// Tests capacity and load balancing at scale

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Academic Medical Center',
				1
			);

			// Create single clerkship (inpatient uses block_based strategy by default)
			const internalMedId = await createTestClerkship(db, 'Internal Medicine', 'inpatient', { requiredDays: 14 });

			// Create students (large cohort)
			const studentIds = await createTestStudents(db, 20);

			// Create many preceptors to handle load
			const preceptorIds = await createTestPreceptors(db, 10, {
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 5,
				clerkshipId: internalMedId,
			});

			// createTestRequirement is now a no-op - configuration moved to createTestClerkship
			// await createTestRequirement(db, internalMedId, {
			// 	requirementType: 'inpatient',
			// 	requiredDays: 14,
			// 	assignmentStrategy: 'block_based',
			// 	blockSizeDays: 7,
			// });

			// Set capacity rules for all preceptors
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 5,
					maxStudentsPerYear: 200,
				});
			}

			// Create preceptor availability for all preceptors
			const availabilityDates = generateDateRange(startDate, 60);
			for (const preceptorId of preceptorIds) {
				await createPreceptorAvailability(db, preceptorId, siteIds[0], availabilityDates);
			}

			// Execute scheduling
			const result = await engine.schedule(
				studentIds,
				[internalMedId],
				{
					startDate,
					endDate,
					dryRun: false,
				}
			);

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			// Verify students scheduled
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify each student has complete schedule
			for (const studentId of studentIds) {
				const assignments = await getStudentAssignments(db, studentId);
				expect(assignments.length).toBe(14);

				// Verify block-based strategy (inpatient defaults to 14-day blocks)
				await assertBlockBasedStrategy(db, studentId, internalMedId, 14);

				// No date conflicts
				await assertNoDateConflicts(db, studentId);
			}

			// Generate summary statistics
			const allAssignments = await db.selectFrom('schedule_assignments').selectAll().execute();

			console.log('\n📊 Large Scale Simulation Results:');
			console.log(`   Total Students: ${studentIds.length}`);
			console.log(`   Total Assignments Created: ${allAssignments.length}`);
			console.log(`   Expected Assignments: ${studentIds.length * 14}`);
		});
	});
});
