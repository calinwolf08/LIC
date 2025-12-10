/**
 * Schedule Duplication Service Tests
 *
 * Unit tests for schedule duplication and entity copying functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	duplicateToNewSchedule,
	quickCopySchedule,
	type DuplicationOptions
} from './schedule-duplication.service';
import {
	createSchedulingPeriod,
	getSchedulingPeriodById,
	getScheduleEntities,
	addEntitiesToSchedule
} from '$lib/features/scheduling/services/scheduling-period-service';
import { nanoid } from 'nanoid';

describe('Schedule Duplication Service', () => {
	let db: Kysely<DB>;
	let sourceScheduleId: string;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();

		// First, deactivate any existing active schedule (migration creates one)
		await db.updateTable('scheduling_periods').set({ is_active: 0 }).execute();

		// Create source schedule
		const sourceSchedule = await createSchedulingPeriod(db, {
			name: 'Source Schedule 2025',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			is_active: true
		});
		sourceScheduleId = sourceSchedule.id;
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	/**
	 * Helper to create test students
	 */
	async function createTestStudents(count: number): Promise<string[]> {
		const ids: string[] = [];
		for (let i = 0; i < count; i++) {
			const id = nanoid();
			await db.insertInto('students').values({
				id,
				name: `Student ${i + 1}`,
				email: `student${i + 1}@test.com`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();
			ids.push(id);
		}
		return ids;
	}

	/**
	 * Helper to create test preceptors
	 */
	async function createTestPreceptors(count: number): Promise<string[]> {
		const ids: string[] = [];
		for (let i = 0; i < count; i++) {
			const id = nanoid();
			await db.insertInto('preceptors').values({
				id,
				name: `Dr. Preceptor ${i + 1}`,
				email: `preceptor${i + 1}@test.com`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();
			ids.push(id);
		}
		return ids;
	}

	/**
	 * Helper to create a test health system
	 */
	async function createTestHealthSystem(name: string): Promise<string> {
		const id = nanoid();
		await db.insertInto('health_systems').values({
			id,
			name,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}).execute();
		return id;
	}

	/**
	 * Helper to create test sites
	 */
	async function createTestSites(count: number): Promise<string[]> {
		const ids: string[] = [];
		const healthSystemId = await createTestHealthSystem('Test Health System');
		for (let i = 0; i < count; i++) {
			const id = nanoid();
			await db.insertInto('sites').values({
				id,
				name: `Site ${i + 1}`,
				health_system_id: healthSystemId,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();
			ids.push(id);
		}
		return ids;
	}

	describe('duplicateToNewSchedule()', () => {
		it('creates a new schedule with specified details', async () => {
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule 2026',
				'2026-01-01',
				'2026-12-31',
				2026,
				{}
			);

			expect(result.schedule).toBeDefined();
			expect(result.schedule.name).toBe('New Schedule 2026');
			expect(result.schedule.start_date).toBe('2026-01-01');
			expect(result.schedule.end_date).toBe('2026-12-31');
			expect(result.schedule.year).toBe(2026);
		});

		it('copies all students when option is "all"', async () => {
			// Create students and add to source schedule
			const studentIds = await createTestStudents(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Duplicate with all students
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: 'all' }
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			expect(newStudents).toHaveLength(3);
			studentIds.forEach(id => expect(newStudents).toContain(id));
			expect(result.entityCounts.students).toBe(3);
		});

		it('copies specific students when IDs are provided', async () => {
			// Create students and add to source schedule
			const studentIds = await createTestStudents(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Duplicate with only first two students
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: [studentIds[0], studentIds[1]] }
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			expect(newStudents).toHaveLength(2);
			expect(newStudents).toContain(studentIds[0]);
			expect(newStudents).toContain(studentIds[1]);
			expect(newStudents).not.toContain(studentIds[2]);
		});

		it('copies multiple entity types', async () => {
			// Create and add students
			const studentIds = await createTestStudents(2);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Create and add preceptors
			const preceptorIds = await createTestPreceptors(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'preceptors', preceptorIds);

			// Create and add sites
			const siteIds = await createTestSites(2);
			await addEntitiesToSchedule(db, sourceScheduleId, 'sites', siteIds);

			// Duplicate with all entities
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{
					students: 'all',
					preceptors: 'all',
					sites: 'all'
				}
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			const newPreceptors = await getScheduleEntities(db, result.schedule.id, 'preceptors');
			const newSites = await getScheduleEntities(db, result.schedule.id, 'sites');

			expect(newStudents).toHaveLength(2);
			expect(newPreceptors).toHaveLength(3);
			expect(newSites).toHaveLength(2);

			expect(result.entityCounts.students).toBe(2);
			expect(result.entityCounts.preceptors).toBe(3);
			expect(result.entityCounts.sites).toBe(2);
		});

		it('does not copy entities not specified in options', async () => {
			// Create and add students
			const studentIds = await createTestStudents(2);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Create and add preceptors
			const preceptorIds = await createTestPreceptors(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'preceptors', preceptorIds);

			// Duplicate with only students
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: 'all' }
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			const newPreceptors = await getScheduleEntities(db, result.schedule.id, 'preceptors');

			expect(newStudents).toHaveLength(2);
			expect(newPreceptors).toHaveLength(0);
		});

		it('creates schedule with no entities when options is empty', async () => {
			// Create and add students to source
			const studentIds = await createTestStudents(2);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Duplicate with empty options
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{}
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			expect(newStudents).toHaveLength(0);
			expect(result.entityCounts.students).toBe(0);
		});

		it('sets new schedule as inactive by default', async () => {
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{}
			);

			expect(result.schedule.is_active).toBe(0);
		});

		it('preserves source schedule entities unchanged', async () => {
			// Create and add students to source
			const studentIds = await createTestStudents(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Duplicate
			await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: [studentIds[0]] }
			);

			// Source schedule should still have all students
			const sourceStudents = await getScheduleEntities(db, sourceScheduleId, 'students');
			expect(sourceStudents).toHaveLength(3);
		});
	});

	describe('quickCopySchedule()', () => {
		it('copies all entities from source schedule', async () => {
			// Create and add students
			const studentIds = await createTestStudents(2);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);

			// Create and add preceptors
			const preceptorIds = await createTestPreceptors(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'preceptors', preceptorIds);

			// Quick copy
			const result = await quickCopySchedule(
				db,
				sourceScheduleId,
				'Quick Copy Schedule',
				'2026-01-01',
				'2026-12-31',
				2026
			);

			const newStudents = await getScheduleEntities(db, result.schedule.id, 'students');
			const newPreceptors = await getScheduleEntities(db, result.schedule.id, 'preceptors');

			expect(newStudents).toHaveLength(2);
			expect(newPreceptors).toHaveLength(3);
		});

		it('creates schedule with correct details', async () => {
			const result = await quickCopySchedule(
				db,
				sourceScheduleId,
				'Quick Copy Schedule',
				'2026-06-01',
				'2026-12-31',
				2026
			);

			expect(result.schedule.name).toBe('Quick Copy Schedule');
			expect(result.schedule.start_date).toBe('2026-06-01');
			expect(result.schedule.end_date).toBe('2026-12-31');
			expect(result.schedule.year).toBe(2026);
		});
	});

	describe('Edge cases', () => {
		it('handles schedule with no entities in source', async () => {
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: 'all', preceptors: 'all' }
			);

			expect(result.schedule).toBeDefined();
			expect(result.entityCounts.students).toBe(0);
			expect(result.entityCounts.preceptors).toBe(0);
		});

		it('handles providing IDs that are not in source schedule', async () => {
			// Create students but don't add to source schedule
			const studentIds = await createTestStudents(2);

			// Try to duplicate with those IDs
			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: studentIds }
			);

			// Should still create schedule but with no students
			// (since they weren't in source)
			expect(result.schedule).toBeDefined();
		});

		it('returns entity counts in result', async () => {
			const studentIds = await createTestStudents(5);
			const preceptorIds = await createTestPreceptors(3);
			await addEntitiesToSchedule(db, sourceScheduleId, 'students', studentIds);
			await addEntitiesToSchedule(db, sourceScheduleId, 'preceptors', preceptorIds);

			const result = await duplicateToNewSchedule(
				db,
				sourceScheduleId,
				'New Schedule',
				'2026-01-01',
				'2026-12-31',
				2026,
				{ students: 'all', preceptors: 'all' }
			);

			expect(result.entityCounts).toEqual({
				students: 5,
				preceptors: 3,
				sites: 0,
				healthSystems: 0,
				clerkships: 0,
				teams: 0,
				configurations: 0
			});
		});
	});
});
