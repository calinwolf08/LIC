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
	createTestRequirement,
	createCapacityRule,
	createTestTeam,
	createFallbackChain,
	getStudentAssignments,
	clearAllTestData,
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
			// School A: Traditional model
			// - All rotations use continuous single preceptor
			// - Strong emphasis on health system continuity
			// - Students stay with one preceptor per clerkship

			// Setup health systems
			const { healthSystemId: hs1, siteIds: sites1 } = await createTestHealthSystem(
				db,
				'University Medical Center',
				2
			);
			const { healthSystemId: hs2, siteIds: sites2 } = await createTestHealthSystem(
				db,
				'Community Hospital',
				1
			);

			// Create clerkships
			const famMedId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');
			const internalMedId = await createTestClerkship(db, 'Internal Medicine', 'Internal Medicine');
			const surgeryId = await createTestClerkship(db, 'Surgery', 'Surgery');

			// Create students
			const studentIds = await createTestStudents(db, 20);

			// Create preceptors
			const famMedPreceptors = await createTestPreceptors(db, 8, {
				specialty: 'Family Medicine',
				healthSystemId: hs1,
				siteId: sites1[0],
				maxStudents: 3,
			});

			const internalMedPreceptors = await createTestPreceptors(db, 6, {
				specialty: 'Internal Medicine',
				healthSystemId: hs1,
				siteId: sites1[1],
				maxStudents: 3,
			});

			const surgeryPreceptors = await createTestPreceptors(db, 5, {
				specialty: 'Surgery',
				healthSystemId: hs2,
				siteId: sites2[0],
				maxStudents: 4,
			});

			// Configure clerkships with continuous single strategy
			await createTestRequirement(db, famMedId, {
				requirementType: 'outpatient',
				requiredDays: 20,
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'prefer_same_system',
			});

			await createTestRequirement(db, internalMedId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'enforce_same_system',
			});

			await createTestRequirement(db, surgeryId, {
				requirementType: 'inpatient',
				requiredDays: 42,
				assignmentStrategy: 'continuous_single',
				healthSystemRule: 'enforce_same_system',
			});

			// Set capacity rules
			for (const preceptorId of [...famMedPreceptors, ...internalMedPreceptors]) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 8,
				});
			}

			for (const preceptorId of surgeryPreceptors) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3,
					maxStudentsPerYear: 10,
				});
			}

			// Execute scheduling for all clerkships
			const result = await engine.schedule(
				studentIds,
				[famMedId, internalMedId, surgeryId],
				{
					dryRun: false,
				}
			);

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(20);
			expect(result.statistics.totalAssignments).toBeGreaterThan(0);

			// Verify each student has continuous single assignments
			for (const studentId of studentIds) {
				// Family Medicine
				await assertStudentHasCompleteAssignments(db, studentId, famMedId, 20);
				await assertContinuousSingleStrategy(db, studentId, famMedId);

				// Internal Medicine
				await assertStudentHasCompleteAssignments(db, studentId, internalMedId, 28);
				await assertContinuousSingleStrategy(db, studentId, internalMedId);
				await assertHealthSystemContinuity(db, studentId, internalMedId);

				// Surgery
				await assertStudentHasCompleteAssignments(db, studentId, surgeryId, 42);
				await assertContinuousSingleStrategy(db, studentId, surgeryId);
				await assertHealthSystemContinuity(db, studentId, surgeryId);

				// No date conflicts
				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 2: Team-Based Medical School', () => {
		it('should schedule using pre-configured teaching teams', async () => {
			// School B: Team-based model
			// - Students assigned to teams, not individual preceptors
			// - Balanced distribution across team members
			// - Emphasis on collaborative learning

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Teaching Hospital',
				2
			);

			// Create clerkships
			const famMedId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');
			const obId = await createTestClerkship(db, 'Obstetrics', 'Obstetrics');

			// Create students
			const studentIds = await createTestStudents(db, 15);

			// Create preceptors for teams
			const famMedTeam1 = await createTestPreceptors(db, 3, {
				specialty: 'Family Medicine',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			const famMedTeam2 = await createTestPreceptors(db, 3, {
				specialty: 'Family Medicine',
				healthSystemId,
				siteId: siteIds[1],
				maxStudents: 3,
			});

			const obTeam = await createTestPreceptors(db, 4, {
				specialty: 'Obstetrics',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			// Configure clerkships with team strategy
			await createTestRequirement(db, famMedId, {
				requirementType: 'outpatient',
				requiredDays: 20,
				assignmentStrategy: 'continuous_team',
			});

			await createTestRequirement(db, obId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'continuous_team',
			});

			// Create teams
			const famMedTeam1Id = await createTestTeam(
				db,
				famMedId,
				'Family Medicine Team A',
				famMedTeam1,
				{
					requireSameHealthSystem: true,
					requireSameSpecialty: true,
				}
			);

			const famMedTeam2Id = await createTestTeam(
				db,
				famMedId,
				'Family Medicine Team B',
				famMedTeam2,
				{
					requireSameHealthSystem: true,
					requireSameSpecialty: true,
				}
			);

			const obTeamId = await createTestTeam(db, obId, 'OB Teaching Team', obTeam, {
				requireSameHealthSystem: true,
				requireSameSpecialty: true,
			});

			// Execute scheduling
			const result = await engine.schedule(studentIds, [famMedId, obId], {
				enableTeamFormation: true,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(15);

			// Verify team assignments
			for (const studentId of studentIds) {
				// Family Medicine - should use one of the two teams
				await assertStudentHasCompleteAssignments(db, studentId, famMedId, 20);
				// Note: Team could be Team A or Team B, just verify assignment exists
				const famMedAssignments = await getStudentAssignments(db, studentId);
				const famMedAssignmentsFiltered = famMedAssignments.filter(
					(a) => a.clerkship_id === famMedId
				);
				expect(famMedAssignmentsFiltered.length).toBeGreaterThan(0);

				// Obstetrics - should use OB team
				await assertStudentHasCompleteAssignments(db, studentId, obId, 28);
				await assertTeamBalanced(db, obTeamId, studentId, obId);

				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 3: Hybrid Medical School', () => {
		it('should handle different strategies for different requirement types', async () => {
			// School C: Hybrid model
			// - Outpatient: continuous single
			// - Inpatient: block-based (14-day blocks)
			// - Elective: daily rotation

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Comprehensive Medical Center',
				3
			);

			// Create clerkship
			const psychiatryId = await createTestClerkship(db, 'Psychiatry', 'Psychiatry');

			// Create students
			const studentIds = await createTestStudents(db, 10);

			// Create preceptors
			const preceptorIds = await createTestPreceptors(db, 8, {
				specialty: 'Psychiatry',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			// Configure hybrid requirements
			// 1. Inpatient with block-based (28 days, 14-day blocks)
			await createTestRequirement(db, psychiatryId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'block_based',
				blockSizeDays: 14,
			});

			// 2. Outpatient with continuous single (14 days)
			await createTestRequirement(db, psychiatryId, {
				requirementType: 'outpatient',
				requiredDays: 14,
				assignmentStrategy: 'continuous_single',
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 10,
				});
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [psychiatryId], {
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(10);

			// Verify hybrid assignments
			for (const studentId of studentIds) {
				const assignments = await getStudentAssignments(db, studentId);
				const psychiatryAssignments = assignments.filter(
					(a) => a.clerkship_id === psychiatryId
				);

				expect(psychiatryAssignments.length).toBeGreaterThan(0);

				// Total should be 28 + 14 = 42 days
				let totalDays = 0;
				for (const assignment of psychiatryAssignments) {
					const start = new Date(assignment.start_date);
					const end = new Date(assignment.end_date);
					const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
					totalDays += days;
				}

				expect(totalDays).toBe(42);

				await assertNoDateConflicts(db, studentId);
			}
		});
	});

	describe('Scenario 4: Flexible Medical School with Fallbacks', () => {
		it('should use extensive fallback chains for coverage', async () => {
			// School D: Flexible model with extensive fallback coverage
			// - Daily rotation strategy
			// - Comprehensive fallback chains
			// - High load (many students)

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Regional Network', 4);

			// Create clerkship
			const emergencyId = await createTestClerkship(db, 'Emergency Medicine', 'Emergency Medicine');

			// Create many students (high load)
			const studentIds = await createTestStudents(db, 30);

			// Create preceptors
			const preceptorIds = await createTestPreceptors(db, 12, {
				specialty: 'Emergency Medicine',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 4,
			});

			// Configure with daily rotation
			await createTestRequirement(db, emergencyId, {
				requirementType: 'inpatient',
				requiredDays: 21,
				assignmentStrategy: 'daily_rotation',
			});

			// Set capacity rules
			for (const preceptorId of preceptorIds) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 3,
					maxStudentsPerYear: 20,
				});
			}

			// Create fallback chains (every preceptor has 2 fallbacks)
			for (let i = 0; i < preceptorIds.length; i++) {
				const fallback1 = preceptorIds[(i + 1) % preceptorIds.length];
				const fallback2 = preceptorIds[(i + 2) % preceptorIds.length];
				await createFallbackChain(db, preceptorIds[i], [fallback1, fallback2]);
			}

			// Execute scheduling
			const result = await engine.schedule(studentIds, [emergencyId], {
				enableFallbacks: true,
				dryRun: false,
			});

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBeGreaterThan(25); // Should schedule most students

			// Verify assignments distributed across preceptors
			for (const studentId of studentIds.slice(0, 10)) {
				// Check first 10 students
				const assignments = await getStudentAssignments(db, studentId);
				const emergencyAssignments = assignments.filter((a) => a.clerkship_id === emergencyId);

				if (emergencyAssignments.length > 0) {
					// Should use multiple preceptors (daily rotation)
					const preceptorSet = new Set(emergencyAssignments.map((a) => a.preceptor_id));
					expect(preceptorSet.size).toBeGreaterThan(1);

					await assertNoDateConflicts(db, studentId);
				}
			}

			// Verify capacity not exceeded
			for (const preceptorId of preceptorIds) {
				await assertNoCapacityViolations(db, preceptorId, 3);
			}
		});
	});

	describe('Scenario 5: Multi-Clerkship Full Year Simulation', () => {
		it('should schedule students across multiple clerkships for full academic year', async () => {
			// Complete academic year with 4 major clerkships
			// Tests realistic full-year scheduling scenario

			// Setup
			const { healthSystemId, siteIds } = await createTestHealthSystem(
				db,
				'Academic Medical Center',
				3
			);

			// Create clerkships
			const famMedId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');
			const internalMedId = await createTestClerkship(db, 'Internal Medicine', 'Internal Medicine');
			const surgeryId = await createTestClerkship(db, 'Surgery', 'Surgery');
			const pediatricsId = await createTestClerkship(db, 'Pediatrics', 'Pediatrics');

			// Create students
			const studentIds = await createTestStudents(db, 25);

			// Create preceptors for each specialty
			const famMedPreceptors = await createTestPreceptors(db, 10, {
				specialty: 'Family Medicine',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			const internalMedPreceptors = await createTestPreceptors(db, 8, {
				specialty: 'Internal Medicine',
				healthSystemId,
				siteId: siteIds[1],
				maxStudents: 3,
			});

			const surgeryPreceptors = await createTestPreceptors(db, 6, {
				specialty: 'Surgery',
				healthSystemId,
				siteId: siteIds[2],
				maxStudents: 4,
			});

			const pediatricsPreceptors = await createTestPreceptors(db, 8, {
				specialty: 'Pediatrics',
				healthSystemId,
				siteId: siteIds[0],
				maxStudents: 3,
			});

			// Configure all clerkships
			await createTestRequirement(db, famMedId, {
				requirementType: 'outpatient',
				requiredDays: 20,
				assignmentStrategy: 'continuous_single',
			});

			await createTestRequirement(db, internalMedId, {
				requirementType: 'inpatient',
				requiredDays: 28,
				assignmentStrategy: 'block_based',
				blockSizeDays: 14,
			});

			await createTestRequirement(db, surgeryId, {
				requirementType: 'inpatient',
				requiredDays: 42,
				assignmentStrategy: 'daily_rotation',
			});

			await createTestRequirement(db, pediatricsId, {
				requirementType: 'outpatient',
				requiredDays: 21,
				assignmentStrategy: 'continuous_single',
			});

			// Set capacity rules for all preceptors
			const allPreceptors = [
				...famMedPreceptors,
				...internalMedPreceptors,
				...surgeryPreceptors,
				...pediatricsPreceptors,
			];

			for (const preceptorId of allPreceptors) {
				await createCapacityRule(db, preceptorId, {
					maxStudentsPerDay: 2,
					maxStudentsPerYear: 15,
				});
			}

			// Execute scheduling for all clerkships
			const result = await engine.schedule(
				studentIds,
				[famMedId, internalMedId, surgeryId, pediatricsId],
				{
					dryRun: false,
				}
			);

			// Assertions
			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.statistics.studentsScheduled).toBe(25);
			expect(result.statistics.totalAssignments).toBeGreaterThan(0);

			// Verify each student has complete schedule
			for (const studentId of studentIds) {
				// Calculate total days across all clerkships
				const assignments = await getStudentAssignments(db, studentId);
				expect(assignments.length).toBeGreaterThan(0);

				let totalDays = 0;
				for (const assignment of assignments) {
					const start = new Date(assignment.start_date);
					const end = new Date(assignment.end_date);
					const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
					totalDays += days;
				}

				// Total: 20 + 28 + 42 + 21 = 111 days
				expect(totalDays).toBe(111);

				// No date conflicts
				await assertNoDateConflicts(db, studentId);
			}

			// Generate summary statistics
			const allAssignments = await db.selectFrom('assignments').selectAll().execute();

			console.log('\n📊 Full Year Simulation Results:');
			console.log(`   Total Students: ${studentIds.length}`);
			console.log(`   Total Assignments Created: ${allAssignments.length}`);
			console.log(`   Students Fully Scheduled: ${result.statistics.studentsScheduled}`);
			console.log(`   Unmet Requirements: ${result.unmetRequirements.length}`);
		});
	});
});
