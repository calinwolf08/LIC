/**
 * Integration Suite 14: Multi-Schedule Support
 *
 * Tests for multi-schedule support functionality including:
 * - Schedule entity associations (junction tables)
 * - Schedule duplication with entity selection
 * - Entity sharing across schedules
 * - Schedule-scoped entity queries
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestStudents,
	createTestRequirement,
	createPreceptorAvailability,
	createTestPreceptor,
	createTestTeam,
	clearAllTestData,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import {
	createSchedulingPeriod,
	getSchedulingPeriodById,
	getScheduleEntities,
	addEntityToSchedule,
	addEntitiesToSchedule,
	removeEntityFromSchedule,
	setScheduleEntities,
	isEntityInMultipleSchedules,
	getSchedulesForEntity,
	getScheduleEntityCounts
} from '../services/scheduling-period-service';
import {
	duplicateToNewSchedule,
	quickCopySchedule
} from '$lib/features/schedules/services/schedule-duplication.service';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import { nanoid } from 'nanoid';

describe('Integration Suite 14: Multi-Schedule Support', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		// Deactivate any existing active schedule (migration creates one)
		await db.updateTable('scheduling_periods').set({ is_active: 0 }).execute();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Schedule Entity Associations', () => {
		it('should associate students with a schedule', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Test Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Create students
			const studentIds = await createTestStudents(db, 3);

			// Associate students with schedule
			await addEntitiesToSchedule(db, schedule.id, 'students', studentIds);

			// Verify association
			const associatedStudents = await getScheduleEntities(db, schedule.id, 'students');
			expect(associatedStudents).toHaveLength(3);
			studentIds.forEach(id => expect(associatedStudents).toContain(id));
		});

		it('should associate preceptors with a schedule', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Test Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Create preceptors
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Test Health System', 1);
			const preceptor1 = await createTestPreceptor(db, { name: 'Dr. One', healthSystemId, siteId });
			const preceptor2 = await createTestPreceptor(db, { name: 'Dr. Two', healthSystemId, siteId });

			// Associate preceptors with schedule
			await addEntitiesToSchedule(db, schedule.id, 'preceptors', [preceptor1, preceptor2]);

			// Verify association
			const associatedPreceptors = await getScheduleEntities(db, schedule.id, 'preceptors');
			expect(associatedPreceptors).toHaveLength(2);
			expect(associatedPreceptors).toContain(preceptor1);
			expect(associatedPreceptors).toContain(preceptor2);
		});

		it('should get entity counts for a schedule', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Test Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Create and associate various entities
			const studentIds = await createTestStudents(db, 5);
			await addEntitiesToSchedule(db, schedule.id, 'students', studentIds);

			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Health System', 3);
			await addEntitiesToSchedule(db, schedule.id, 'sites', siteIds);
			await addEntityToSchedule(db, schedule.id, 'health_systems', healthSystemId);

			const preceptorIds: string[] = [];
			for (let i = 0; i < 4; i++) {
				const id = await createTestPreceptor(db, {
					name: `Dr. ${i + 1}`,
					healthSystemId,
					siteId: siteIds[0]
				});
				preceptorIds.push(id);
			}
			await addEntitiesToSchedule(db, schedule.id, 'preceptors', preceptorIds);

			// Get counts
			const counts = await getScheduleEntityCounts(db, schedule.id);

			expect(counts.students).toBe(5);
			expect(counts.preceptors).toBe(4);
			expect(counts.sites).toBe(3);
			expect(counts.health_systems).toBe(1);
		});
	});

	describe('Test 2: Entity Sharing Across Schedules', () => {
		it('should allow the same student in multiple schedules', async () => {
			// Create two schedules
			const schedule2025 = await createSchedulingPeriod(db, {
				name: 'Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			const schedule2026 = await createSchedulingPeriod(db, {
				name: 'Schedule 2026',
				start_date: '2026-01-01',
				end_date: '2026-12-31',
				is_active: false
			});

			// Create a student
			const studentIds = await createTestStudents(db, 1);
			const studentId = studentIds[0];

			// Add to both schedules
			await addEntityToSchedule(db, schedule2025.id, 'students', studentId);
			await addEntityToSchedule(db, schedule2026.id, 'students', studentId);

			// Verify student is in both
			const students2025 = await getScheduleEntities(db, schedule2025.id, 'students');
			const students2026 = await getScheduleEntities(db, schedule2026.id, 'students');

			expect(students2025).toContain(studentId);
			expect(students2026).toContain(studentId);

			// Check multi-schedule detection
			const isMultiple = await isEntityInMultipleSchedules(db, 'students', studentId);
			expect(isMultiple).toBe(true);

			// Get all schedules for entity
			const schedulesForStudent = await getSchedulesForEntity(db, 'students', studentId);
			expect(schedulesForStudent).toHaveLength(2);
		});

		it('should correctly identify entities in single vs multiple schedules', async () => {
			// Create two schedules
			const schedule1 = await createSchedulingPeriod(db, {
				name: 'Schedule 1',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			const schedule2 = await createSchedulingPeriod(db, {
				name: 'Schedule 2',
				start_date: '2026-01-01',
				end_date: '2026-12-31',
				is_active: false
			});

			// Create students
			const studentIds = await createTestStudents(db, 2);
			const sharedStudent = studentIds[0];
			const singleStudent = studentIds[1];

			// Shared student in both schedules
			await addEntityToSchedule(db, schedule1.id, 'students', sharedStudent);
			await addEntityToSchedule(db, schedule2.id, 'students', sharedStudent);

			// Single student only in schedule 1
			await addEntityToSchedule(db, schedule1.id, 'students', singleStudent);

			// Check
			expect(await isEntityInMultipleSchedules(db, 'students', sharedStudent)).toBe(true);
			expect(await isEntityInMultipleSchedules(db, 'students', singleStudent)).toBe(false);
		});
	});

	describe('Test 3: Schedule Duplication', () => {
		it('should duplicate a schedule with all entities', async () => {
			// Create source schedule with entities
			const sourceSchedule = await createSchedulingPeriod(db, {
				name: 'Source Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Add entities to source
			const studentIds = await createTestStudents(db, 4);
			await addEntitiesToSchedule(db, sourceSchedule.id, 'students', studentIds);

			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test HS', 2);
			await addEntityToSchedule(db, sourceSchedule.id, 'health_systems', healthSystemId);
			await addEntitiesToSchedule(db, sourceSchedule.id, 'sites', siteIds);

			// Duplicate schedule
			const result = await quickCopySchedule(
				db,
				sourceSchedule.id,
				'Copied Schedule 2026',
				'2026-01-01',
				'2026-12-31',
				2026
			);

			// Verify new schedule created
			expect(result.schedule.name).toBe('Copied Schedule 2026');
			expect(result.schedule.year).toBe(2026);

			// Verify entities were copied
			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			expect(newStudents).toHaveLength(4);
			studentIds.forEach(id => expect(newStudents).toContain(id));

			const newSites = await getScheduleEntities(db, result.schedule.id, 'sites');
			expect(newSites).toHaveLength(2);
		});

		it('should duplicate a schedule with selected entities only', async () => {
			// Create source schedule with entities
			const sourceSchedule = await createSchedulingPeriod(db, {
				name: 'Source Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Add students
			const studentIds = await createTestStudents(db, 4);
			await addEntitiesToSchedule(db, sourceSchedule.id, 'students', studentIds);

			// Duplicate with only 2 students
			const selectedStudents = [studentIds[0], studentIds[2]];
			const result = await duplicateToNewSchedule(
				db,
				sourceSchedule.id,
				'Partial Copy 2026',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: selectedStudents }
			);

			// Verify only selected students were copied
			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			expect(newStudents).toHaveLength(2);
			expect(newStudents).toContain(studentIds[0]);
			expect(newStudents).toContain(studentIds[2]);
			expect(newStudents).not.toContain(studentIds[1]);
			expect(newStudents).not.toContain(studentIds[3]);
		});
	});

	describe('Test 4: Entity Removal from Schedules', () => {
		it('should remove entity from one schedule without affecting others', async () => {
			// Create two schedules
			const schedule1 = await createSchedulingPeriod(db, {
				name: 'Schedule 1',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			const schedule2 = await createSchedulingPeriod(db, {
				name: 'Schedule 2',
				start_date: '2026-01-01',
				end_date: '2026-12-31',
				is_active: false
			});

			// Create and share a student
			const studentIds = await createTestStudents(db, 1);
			const studentId = studentIds[0];

			await addEntityToSchedule(db, schedule1.id, 'students', studentId);
			await addEntityToSchedule(db, schedule2.id, 'students', studentId);

			// Remove from schedule 1
			await removeEntityFromSchedule(db, schedule1.id, 'students', studentId);

			// Verify removal from schedule 1 but not schedule 2
			const students1 = await getScheduleEntities(db, schedule1.id, 'students');
			const students2 = await getScheduleEntities(db, schedule2.id, 'students');

			expect(students1).not.toContain(studentId);
			expect(students2).toContain(studentId);

			// Now entity should not be in multiple schedules
			const isMultiple = await isEntityInMultipleSchedules(db, 'students', studentId);
			expect(isMultiple).toBe(false);
		});

		it('should set entities to replace entire association set', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Test Schedule',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Add initial students
			const studentIds = await createTestStudents(db, 4);
			await addEntitiesToSchedule(db, schedule.id, 'students', studentIds.slice(0, 2)); // Add first 2

			// Replace with different set
			await setScheduleEntities(db, schedule.id, 'students', studentIds.slice(2)); // Set to last 2

			// Verify replacement
			const students = await getScheduleEntities(db, schedule.id, 'students');
			expect(students).toHaveLength(2);
			expect(students).not.toContain(studentIds[0]);
			expect(students).not.toContain(studentIds[1]);
			expect(students).toContain(studentIds[2]);
			expect(students).toContain(studentIds[3]);
		});
	});

	describe('Test 5: Schedule with Scheduling Engine', () => {
		it('should schedule assignments for entities in a schedule', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Test Schedule 2025',
				start_date: '2025-12-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Create health system and site
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);

			// Create clerkship
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient');

			// Create preceptor
			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId
			});

			// Create requirement
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5
			});

			// Create team
			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			// Create students
			const studentIds = await createTestStudents(db, 2);

			// Associate entities with schedule
			await addEntitiesToSchedule(db, schedule.id, 'students', studentIds);
			await addEntityToSchedule(db, schedule.id, 'preceptors', preceptorId);
			await addEntityToSchedule(db, schedule.id, 'sites', siteId);
			await addEntityToSchedule(db, schedule.id, 'health_systems', healthSystemId);
			await addEntityToSchedule(db, schedule.id, 'clerkships', clerkshipId);

			// Create availability
			const dates = generateDateRange('2025-12-01', 14);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31'
			});

			// Verify scheduling worked
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBeGreaterThan(0);

			// Verify each student got assignments
			for (const studentId of studentIds) {
				const assignments = result.assignments.filter(a => a.studentId === studentId);
				expect(assignments.length).toBeGreaterThan(0);
			}
		});
	});

	describe('Test 6: Multiple Entity Types', () => {
		it('should manage all entity types for a schedule', async () => {
			// Create schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Complete Schedule 2025',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Create entities of all types
			const studentIds = await createTestStudents(db, 3);
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test HS', 2);

			const preceptorIds: string[] = [];
			for (let i = 0; i < 2; i++) {
				const id = await createTestPreceptor(db, {
					name: `Dr. ${i + 1}`,
					healthSystemId,
					siteId: siteIds[0]
				});
				preceptorIds.push(id);
			}

			const clerkshipId = await createTestClerkship(db, 'Test Clerkship', 'outpatient');
			const teamId = await createTestTeam(db, clerkshipId, 'Test Team', preceptorIds);

			// Associate all with schedule
			await addEntitiesToSchedule(db, schedule.id, 'students', studentIds);
			await addEntitiesToSchedule(db, schedule.id, 'preceptors', preceptorIds);
			await addEntitiesToSchedule(db, schedule.id, 'sites', siteIds);
			await addEntityToSchedule(db, schedule.id, 'health_systems', healthSystemId);
			await addEntityToSchedule(db, schedule.id, 'clerkships', clerkshipId);
			await addEntityToSchedule(db, schedule.id, 'teams', teamId);

			// Verify all associations
			const counts = await getScheduleEntityCounts(db, schedule.id);
			expect(counts.students).toBe(3);
			expect(counts.preceptors).toBe(2);
			expect(counts.sites).toBe(2);
			expect(counts.health_systems).toBe(1);
			expect(counts.clerkships).toBe(1);
			expect(counts.teams).toBe(1);
		});
	});

	describe('Test 7: Year Column on Schedule', () => {
		it('should store year on scheduling period', async () => {
			// Create schedule with year
			const schedule = await createSchedulingPeriod(db, {
				name: 'AY 2025-2026',
				start_date: '2025-07-01',
				end_date: '2026-06-30',
				is_active: true
			});

			// The year should be derived or set during creation
			// Let's manually set it and verify retrieval
			await db
				.updateTable('scheduling_periods')
				.set({ year: 2025 })
				.where('id', '=', schedule.id)
				.execute();

			const retrieved = await getSchedulingPeriodById(db, schedule.id);
			expect(retrieved?.year).toBe(2025);
		});
	});

	describe('Test 8: Empty Schedule Operations', () => {
		it('should handle operations on schedule with no entities', async () => {
			// Create empty schedule
			const schedule = await createSchedulingPeriod(db, {
				name: 'Empty Schedule',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Get entities (should be empty)
			const students = await getScheduleEntities(db, schedule.id, 'students');
			expect(students).toEqual([]);

			// Get counts (should be all zeros)
			const counts = await getScheduleEntityCounts(db, schedule.id);
			expect(counts.students).toBe(0);
			expect(counts.preceptors).toBe(0);
			expect(counts.sites).toBe(0);

			// Remove non-existent entity (should not throw)
			await removeEntityFromSchedule(db, schedule.id, 'students', 'non-existent-id');
		});

		it('should handle duplication of empty schedule', async () => {
			// Create empty source schedule
			const sourceSchedule = await createSchedulingPeriod(db, {
				name: 'Empty Source',
				start_date: '2025-01-01',
				end_date: '2025-12-31',
				is_active: true
			});

			// Duplicate
			const result = await quickCopySchedule(
				db,
				sourceSchedule.id,
				'Empty Copy',
				'2026-01-01',
				'2026-12-31',
				2026
			);

			// Verify copy created with no entities
			expect(result.schedule.name).toBe('Empty Copy');
			const counts = await getScheduleEntityCounts(db, result.schedule.id);
			expect(counts.students).toBe(0);
		});
	});
});
