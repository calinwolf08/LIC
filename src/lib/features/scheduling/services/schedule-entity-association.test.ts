/**
 * Schedule Entity Association Tests
 *
 * Unit tests for schedule-entity junction table operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createSchedulingPeriod,
	getScheduleEntities,
	addEntityToSchedule,
	addEntitiesToSchedule,
	removeEntityFromSchedule,
	setScheduleEntities,
	isEntityInMultipleSchedules,
	getSchedulesForEntity,
	getScheduleEntityCounts,
	type ScheduleEntityType
} from './scheduling-period-service';
import { nanoid } from 'nanoid';

describe('Schedule Entity Association Service', () => {
	let db: Kysely<DB>;
	let scheduleId: string;
	let schedule2Id: string;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();

		// First, deactivate any existing active schedule (migration creates one)
		await db.updateTable('scheduling_periods').set({ is_active: 0 }).execute();

		// Create test schedules
		const schedule1 = await createSchedulingPeriod(db, {
			name: 'Schedule 2025',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			is_active: true
		});
		scheduleId = schedule1.id!; // Non-null assertion - just created

		const schedule2 = await createSchedulingPeriod(db, {
			name: 'Schedule 2026',
			start_date: '2026-01-01',
			end_date: '2026-12-31',
			is_active: false
		});
		schedule2Id = schedule2.id!; // Non-null assertion - just created
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	/**
	 * Helper to create a test student
	 */
	async function createTestStudent(name: string): Promise<string> {
		const id = nanoid();
		await db.insertInto('students').values({
			id,
			name,
			email: `${name.toLowerCase().replace(/\s/g, '.')}@test.com`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}).execute();
		return id;
	}

	/**
	 * Helper to create a test preceptor
	 */
	async function createTestPreceptor(name: string): Promise<string> {
		const id = nanoid();
		await db.insertInto('preceptors').values({
			id,
			name,
			email: `${name.toLowerCase().replace(/\s/g, '.')}@test.com`,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}).execute();
		return id;
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
	 * Helper to create a test site
	 */
	async function createTestSite(name: string, healthSystemId?: string): Promise<string> {
		const id = nanoid();
		const hsId = healthSystemId || await createTestHealthSystem(`HS for ${name}`);
		await db.insertInto('sites').values({
			id,
			name,
			health_system_id: hsId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}).execute();
		return id;
	}

	describe('addEntityToSchedule()', () => {
		it('adds a student to a schedule', async () => {
			const studentId = await createTestStudent('John Doe');

			await addEntityToSchedule(db, scheduleId, 'students', studentId);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toContain(studentId);
		});

		it('adds a preceptor to a schedule', async () => {
			const preceptorId = await createTestPreceptor('Dr. Smith');

			await addEntityToSchedule(db, scheduleId, 'preceptors', preceptorId);

			const entities = await getScheduleEntities(db, scheduleId, 'preceptors');
			expect(entities).toContain(preceptorId);
		});

		it('adds a site to a schedule', async () => {
			const siteId = await createTestSite('Main Hospital');

			await addEntityToSchedule(db, scheduleId, 'sites', siteId);

			const entities = await getScheduleEntities(db, scheduleId, 'sites');
			expect(entities).toContain(siteId);
		});

		it('does not duplicate when adding same entity twice', async () => {
			const studentId = await createTestStudent('John Doe');

			await addEntityToSchedule(db, scheduleId, 'students', studentId);
			await addEntityToSchedule(db, scheduleId, 'students', studentId);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(1);
		});

		it('allows same entity in multiple schedules', async () => {
			const studentId = await createTestStudent('John Doe');

			await addEntityToSchedule(db, scheduleId, 'students', studentId);
			await addEntityToSchedule(db, schedule2Id, 'students', studentId);

			const entities1 = await getScheduleEntities(db, scheduleId, 'students');
			const entities2 = await getScheduleEntities(db, schedule2Id, 'students');

			expect(entities1).toContain(studentId);
			expect(entities2).toContain(studentId);
		});
	});

	describe('addEntitiesToSchedule()', () => {
		it('adds multiple students to a schedule in bulk', async () => {
			const studentIds = await Promise.all([
				createTestStudent('Student 1'),
				createTestStudent('Student 2'),
				createTestStudent('Student 3')
			]);

			await addEntitiesToSchedule(db, scheduleId, 'students', studentIds);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(3);
			studentIds.forEach(id => expect(entities).toContain(id));
		});

		it('handles empty array gracefully', async () => {
			await addEntitiesToSchedule(db, scheduleId, 'students', []);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(0);
		});

		it('skips duplicates when bulk adding', async () => {
			const studentId = await createTestStudent('Student 1');

			// Add once
			await addEntityToSchedule(db, scheduleId, 'students', studentId);

			// Try to add again with bulk
			await addEntitiesToSchedule(db, scheduleId, 'students', [studentId]);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(1);
		});
	});

	describe('removeEntityFromSchedule()', () => {
		it('removes a student from a schedule', async () => {
			const studentId = await createTestStudent('John Doe');
			await addEntityToSchedule(db, scheduleId, 'students', studentId);

			await removeEntityFromSchedule(db, scheduleId, 'students', studentId);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).not.toContain(studentId);
		});

		it('does not affect other schedules when removing', async () => {
			const studentId = await createTestStudent('John Doe');
			await addEntityToSchedule(db, scheduleId, 'students', studentId);
			await addEntityToSchedule(db, schedule2Id, 'students', studentId);

			await removeEntityFromSchedule(db, scheduleId, 'students', studentId);

			const entities1 = await getScheduleEntities(db, scheduleId, 'students');
			const entities2 = await getScheduleEntities(db, schedule2Id, 'students');

			expect(entities1).not.toContain(studentId);
			expect(entities2).toContain(studentId);
		});

		it('does nothing when removing non-existent association', async () => {
			const studentId = await createTestStudent('John Doe');

			// Should not throw
			await removeEntityFromSchedule(db, scheduleId, 'students', studentId);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(0);
		});
	});

	describe('setScheduleEntities()', () => {
		it('replaces all entities for a schedule', async () => {
			const student1 = await createTestStudent('Student 1');
			const student2 = await createTestStudent('Student 2');
			const student3 = await createTestStudent('Student 3');

			// Add initial entities
			await addEntitiesToSchedule(db, scheduleId, 'students', [student1, student2]);

			// Replace with new set
			await setScheduleEntities(db, scheduleId, 'students', [student2, student3]);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(2);
			expect(entities).not.toContain(student1);
			expect(entities).toContain(student2);
			expect(entities).toContain(student3);
		});

		it('clears all entities when setting empty array', async () => {
			const studentIds = await Promise.all([
				createTestStudent('Student 1'),
				createTestStudent('Student 2')
			]);
			await addEntitiesToSchedule(db, scheduleId, 'students', studentIds);

			await setScheduleEntities(db, scheduleId, 'students', []);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(0);
		});
	});

	describe('getScheduleEntities()', () => {
		it('returns empty array when no entities associated', async () => {
			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toEqual([]);
		});

		it('returns all associated entity IDs', async () => {
			const studentIds = await Promise.all([
				createTestStudent('Student 1'),
				createTestStudent('Student 2')
			]);
			await addEntitiesToSchedule(db, scheduleId, 'students', studentIds);

			const entities = await getScheduleEntities(db, scheduleId, 'students');
			expect(entities).toHaveLength(2);
			studentIds.forEach(id => expect(entities).toContain(id));
		});

		it('returns entities only for specified schedule', async () => {
			const student1 = await createTestStudent('Student 1');
			const student2 = await createTestStudent('Student 2');

			await addEntityToSchedule(db, scheduleId, 'students', student1);
			await addEntityToSchedule(db, schedule2Id, 'students', student2);

			const entities1 = await getScheduleEntities(db, scheduleId, 'students');
			const entities2 = await getScheduleEntities(db, schedule2Id, 'students');

			expect(entities1).toEqual([student1]);
			expect(entities2).toEqual([student2]);
		});
	});

	describe('isEntityInMultipleSchedules()', () => {
		it('returns false when entity is in one schedule', async () => {
			const studentId = await createTestStudent('John Doe');
			await addEntityToSchedule(db, scheduleId, 'students', studentId);

			const isMultiple = await isEntityInMultipleSchedules(db, 'students', studentId);
			expect(isMultiple).toBe(false);
		});

		it('returns true when entity is in multiple schedules', async () => {
			const studentId = await createTestStudent('John Doe');
			await addEntityToSchedule(db, scheduleId, 'students', studentId);
			await addEntityToSchedule(db, schedule2Id, 'students', studentId);

			const isMultiple = await isEntityInMultipleSchedules(db, 'students', studentId);
			expect(isMultiple).toBe(true);
		});

		it('returns false when entity is in no schedules', async () => {
			const studentId = await createTestStudent('John Doe');

			const isMultiple = await isEntityInMultipleSchedules(db, 'students', studentId);
			expect(isMultiple).toBe(false);
		});
	});

	describe('getSchedulesForEntity()', () => {
		it('returns all schedules containing the entity', async () => {
			const studentId = await createTestStudent('John Doe');
			await addEntityToSchedule(db, scheduleId, 'students', studentId);
			await addEntityToSchedule(db, schedule2Id, 'students', studentId);

			const schedules = await getSchedulesForEntity(db, 'students', studentId);

			expect(schedules).toHaveLength(2);
			const scheduleIds = schedules.map(s => s.id);
			expect(scheduleIds).toContain(scheduleId);
			expect(scheduleIds).toContain(schedule2Id);
		});

		it('returns empty array when entity is in no schedules', async () => {
			const studentId = await createTestStudent('John Doe');

			const schedules = await getSchedulesForEntity(db, 'students', studentId);
			expect(schedules).toEqual([]);
		});
	});

	describe('getScheduleEntityCounts()', () => {
		it('returns counts for all entity types', async () => {
			const studentIds = await Promise.all([
				createTestStudent('Student 1'),
				createTestStudent('Student 2')
			]);
			const preceptorId = await createTestPreceptor('Dr. Smith');
			const siteIds = await Promise.all([
				createTestSite('Site 1'),
				createTestSite('Site 2'),
				createTestSite('Site 3')
			]);

			await addEntitiesToSchedule(db, scheduleId, 'students', studentIds);
			await addEntityToSchedule(db, scheduleId, 'preceptors', preceptorId);
			await addEntitiesToSchedule(db, scheduleId, 'sites', siteIds);

			const counts = await getScheduleEntityCounts(db, scheduleId);

			expect(counts.students).toBe(2);
			expect(counts.preceptors).toBe(1);
			expect(counts.sites).toBe(3);
			expect(counts.health_systems).toBe(0);
			expect(counts.clerkships).toBe(0);
			expect(counts.teams).toBe(0);
			expect(counts.configurations).toBe(0);
		});

		it('returns zeros when schedule has no entities', async () => {
			const counts = await getScheduleEntityCounts(db, scheduleId);

			expect(counts.students).toBe(0);
			expect(counts.preceptors).toBe(0);
			expect(counts.sites).toBe(0);
		});
	});

	describe('Entity type mapping', () => {
		const entityTypes: ScheduleEntityType[] = [
			'students',
			'preceptors',
			'sites',
			'health_systems',
			'clerkships',
			'teams',
			'configurations'
		];

		entityTypes.forEach(entityType => {
			it(`supports ${entityType} entity type`, async () => {
				// Just verify the functions don't throw for this entity type
				const entities = await getScheduleEntities(db, scheduleId, entityType);
				expect(Array.isArray(entities)).toBe(true);
			});
		});
	});
});
