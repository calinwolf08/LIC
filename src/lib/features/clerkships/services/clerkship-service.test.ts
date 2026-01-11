// @ts-nocheck
/**
 * Clerkship Service Unit Tests
 *
 * Tests for clerkship business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, Clerkships } from '$lib/db/types';
import {
	getClerkships,
	getClerkshipById,
	getClerkshipByName,
	createClerkship,
	updateClerkship,
	deleteClerkship,
	canDeleteClerkship,
	clerkshipExists,
	isNameTaken,
	getClerkshipsBySchedule
} from './clerkship-service';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestUser,
	createTestSchedule,
	associateClerkshipWithSchedule
} from '$lib/testing/integration-helpers';

function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	const db = new Kysely<DB>({
		dialect: new SqliteDialect({ database: sqlite })
	});
	return db;
}

async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('clerkship_type', 'text', (col) => col.notNull())
		.addColumn('required_days', 'integer', (col) => col.notNull())
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Also create clerkship_configurations table for createClerkship to work
	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('override_mode', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

function createMockClerkshipData(
	overrides: Partial<Omit<Clerkships, 'id' | 'created_at' | 'updated_at'>> = {}
): Omit<Clerkships, 'id' | 'created_at' | 'updated_at'> {
	return {
		name: 'Family Medicine Clerkship',
		clerkship_type: 'outpatient',
		required_days: 5,
		description: null,
		...overrides
	};
}

async function createClerkshipDirect(
	db: Kysely<DB>,
	data: Partial<Clerkships> = {}
): Promise<Clerkships> {
	const timestamp = new Date().toISOString();
	const clerkship: Clerkships = {
		id: crypto.randomUUID(),
		name: 'Family Medicine Clerkship',
		clerkship_type: 'outpatient',
		required_days: 5,
		description: null,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db
		.insertInto('clerkships')
		.values(clerkship)
		.returningAll()
		.executeTakeFirstOrThrow();
}

describe('Clerkship Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getClerkships()', () => {
		it('returns empty array when no clerkships exist', async () => {
			const clerkships = await getClerkships(db);
			expect(clerkships).toEqual([]);
		});

		it('returns all clerkships', async () => {
			await createClerkshipDirect(db, { name: 'FM Clerkship' });
			await createClerkshipDirect(db, { name: 'IM Clerkship' });

			const clerkships = await getClerkships(db);
			expect(clerkships).toHaveLength(2);
		});

		it('returns clerkships ordered by name ascending', async () => {
			await createClerkshipDirect(db, { name: 'Surgery Clerkship' });
			await createClerkshipDirect(db, { name: 'Family Medicine Clerkship' });
			await createClerkshipDirect(db, { name: 'Pediatrics Clerkship' });

			const clerkships = await getClerkships(db);
			expect(clerkships[0].name).toBe('Family Medicine Clerkship');
			expect(clerkships[1].name).toBe('Pediatrics Clerkship');
			expect(clerkships[2].name).toBe('Surgery Clerkship');
		});
	});

	describe('getClerkshipById()', () => {
		it('returns clerkship when found', async () => {
			const created = await createClerkshipDirect(db);

			const found = await getClerkshipById(db, created.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.name).toBe(created.name);
		});

		it('returns null when clerkship not found', async () => {
			const found = await getClerkshipById(db, 'nonexistent-id');
			expect(found).toBeNull();
		});

		it('returns complete clerkship data', async () => {
			const created = await createClerkshipDirect(db, {
				name: 'Test Clerkship',
				clerkship_type: 'inpatient',
				required_days: 10,
				description: 'Test description'
			});

			const found = await getClerkshipById(db, created.id);
			expect(found?.clerkship_type).toBe('inpatient');
			expect(found?.required_days).toBe(10);
			expect(found?.description).toBe('Test description');
		});
	});

	describe('getClerkshipByName()', () => {
		it('finds clerkship by exact name', async () => {
			const created = await createClerkshipDirect(db, { name: 'Test Clerkship' });

			const found = await getClerkshipByName(db, 'Test Clerkship');
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
		});

		it('is case-insensitive', async () => {
			const created = await createClerkshipDirect(db, { name: 'Test Clerkship' });

			const found = await getClerkshipByName(db, 'test clerkship');
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
		});

		it('returns null when name not found', async () => {
			const found = await getClerkshipByName(db, 'Nonexistent');
			expect(found).toBeNull();
		});
	});

	describe('createClerkship()', () => {
		it('creates a new clerkship', async () => {
			const data = createMockClerkshipData({
				name: 'New Clerkship',
				clerkship_type: 'inpatient',
				required_days: 8
			});

			const created = await createClerkship(db, data);

			expect(created.id).toBeDefined();
			expect(created.name).toBe('New Clerkship');
			expect(created.clerkship_type).toBe('inpatient');
			expect(created.required_days).toBe(8);
			expect(created.created_at).toBeDefined();
			expect(created.updated_at).toBeDefined();
		});

		it('creates clerkship with optional description', async () => {
			const data = createMockClerkshipData({
				description: 'Test description'
			});

			const created = await createClerkship(db, data);

			expect(created.description).toBe('Test description');
		});

		it('throws ConflictError when name already exists', async () => {
			const data = createMockClerkshipData({ name: 'Duplicate' });

			await createClerkship(db, data);

			await expect(createClerkship(db, data)).rejects.toThrow(ConflictError);
			await expect(createClerkship(db, data)).rejects.toThrow('name already exists');
		});

		it('name conflict check is case-insensitive', async () => {
			const data1 = createMockClerkshipData({ name: 'Test Clerkship' });
			const data2 = createMockClerkshipData({ name: 'test clerkship' });

			await createClerkship(db, data1);

			await expect(createClerkship(db, data2)).rejects.toThrow(ConflictError);
		});

		it('sets created_at and updated_at to same value', async () => {
			const data = createMockClerkshipData();

			const created = await createClerkship(db, data);

			expect(created.created_at).toBe(created.updated_at);
		});
	});

	describe('updateClerkship()', () => {
		it('updates clerkship name', async () => {
			const clerkship = await createClerkshipDirect(db, { name: 'Original' });

			const updated = await updateClerkship(db, clerkship.id, { name: 'Updated' });

			expect(updated.name).toBe('Updated');
			expect(updated.id).toBe(clerkship.id);
		});

		it('updates clerkship type', async () => {
			const clerkship = await createClerkshipDirect(db, { clerkship_type: 'outpatient' });

			const updated = await updateClerkship(db, clerkship.id, {
				clerkship_type: 'inpatient'
			});

			expect(updated.clerkship_type).toBe('inpatient');
		});

		it('updates clerkship required_days', async () => {
			const clerkship = await createClerkshipDirect(db, { required_days: 5 });

			const updated = await updateClerkship(db, clerkship.id, { required_days: 10 });

			expect(updated.required_days).toBe(10);
		});

		it('updates clerkship description', async () => {
			const clerkship = await createClerkshipDirect(db, { description: null });

			const updated = await updateClerkship(db, clerkship.id, {
				description: 'New description'
			});

			expect(updated.description).toBe('New description');
		});

		it('updates multiple fields at once', async () => {
			const clerkship = await createClerkshipDirect(db);

			const updated = await updateClerkship(db, clerkship.id, {
				name: 'New Name',
				clerkship_type: 'inpatient',
				required_days: 15
			});

			expect(updated.name).toBe('New Name');
			expect(updated.clerkship_type).toBe('inpatient');
			expect(updated.required_days).toBe(15);
		});

		it('updates updated_at timestamp', async () => {
			const clerkship = await createClerkshipDirect(db);
			const originalUpdatedAt = clerkship.updated_at;

			// Small delay to ensure timestamp differs
			await new Promise((resolve) => setTimeout(resolve, 10));

			const updated = await updateClerkship(db, clerkship.id, { name: 'New Name' });

			expect(updated.updated_at).not.toBe(originalUpdatedAt);
			expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
				new Date(originalUpdatedAt).getTime()
			);
		});

		it('throws NotFoundError when clerkship does not exist', async () => {
			await expect(updateClerkship(db, 'nonexistent-id', { name: 'New Name' })).rejects.toThrow(
				NotFoundError
			);
		});

		it('throws ConflictError when new name is already taken', async () => {
			const clerkship1 = await createClerkshipDirect(db, { name: 'First' });
			await createClerkshipDirect(db, { name: 'Second' });

			await expect(updateClerkship(db, clerkship1.id, { name: 'Second' })).rejects.toThrow(
				ConflictError
			);
		});

		it('allows updating to same name (case-insensitive)', async () => {
			const clerkship = await createClerkshipDirect(db, { name: 'Test Clerkship' });

			const updated = await updateClerkship(db, clerkship.id, { name: 'test clerkship' });

			expect(updated.name).toBe('test clerkship');
		});
	});

	describe('deleteClerkship()', () => {
		it('deletes a clerkship', async () => {
			const clerkship = await createClerkshipDirect(db);

			await deleteClerkship(db, clerkship.id);

			const found = await getClerkshipById(db, clerkship.id);
			expect(found).toBeNull();
		});

		it('throws NotFoundError when clerkship does not exist', async () => {
			await expect(deleteClerkship(db, 'nonexistent-id')).rejects.toThrow(NotFoundError);
		});

		it('throws ConflictError when clerkship has schedule assignments', async () => {
			const clerkship = await createClerkshipDirect(db);

			// Add a schedule assignment
			await db
				.insertInto('schedule_assignments')
				.values({
					id: crypto.randomUUID(),
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: clerkship.id,
					date: '2024-01-15',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			await expect(deleteClerkship(db, clerkship.id)).rejects.toThrow(ConflictError);
			await expect(deleteClerkship(db, clerkship.id)).rejects.toThrow(
				'existing schedule assignments'
			);
		});
	});

	describe('canDeleteClerkship()', () => {
		it('returns true when clerkship has no assignments', async () => {
			const clerkship = await createClerkshipDirect(db);

			const canDelete = await canDeleteClerkship(db, clerkship.id);

			expect(canDelete).toBe(true);
		});

		it('returns false when clerkship has assignments', async () => {
			const clerkship = await createClerkshipDirect(db);

			await db
				.insertInto('schedule_assignments')
				.values({
					id: crypto.randomUUID(),
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: clerkship.id,
					date: '2024-01-15',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			const canDelete = await canDeleteClerkship(db, clerkship.id);

			expect(canDelete).toBe(false);
		});
	});

	describe('clerkshipExists()', () => {
		it('returns true when clerkship exists', async () => {
			const clerkship = await createClerkshipDirect(db);

			const exists = await clerkshipExists(db, clerkship.id);

			expect(exists).toBe(true);
		});

		it('returns false when clerkship does not exist', async () => {
			const exists = await clerkshipExists(db, 'nonexistent-id');

			expect(exists).toBe(false);
		});
	});

	describe('isNameTaken()', () => {
		it('returns true when name is taken', async () => {
			await createClerkshipDirect(db, { name: 'Taken Name' });

			const taken = await isNameTaken(db, 'Taken Name');

			expect(taken).toBe(true);
		});

		it('returns false when name is not taken', async () => {
			const taken = await isNameTaken(db, 'Available Name');

			expect(taken).toBe(false);
		});

		it('is case-insensitive', async () => {
			await createClerkshipDirect(db, { name: 'Test Name' });

			const taken = await isNameTaken(db, 'test name');

			expect(taken).toBe(true);
		});

		it('excludes specified clerkship ID', async () => {
			const clerkship = await createClerkshipDirect(db, { name: 'Test Name' });

			const taken = await isNameTaken(db, 'Test Name', clerkship.id);

			expect(taken).toBe(false);
		});

		it('does not exclude other clerkships when excludeId is provided', async () => {
			const clerkship1 = await createClerkshipDirect(db, { name: 'Name1' });
			await createClerkshipDirect(db, { name: 'Name2' });

			const taken = await isNameTaken(db, 'Name2', clerkship1.id);

			expect(taken).toBe(true);
		});
	});
});

/**
 * Multi-tenancy Tests
 *
 * Tests for schedule-based data isolation
 */
describe('Clerkship Service - Multi-tenancy', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('getClerkshipsBySchedule()', () => {
		it('returns only clerkships associated with the given schedule', async () => {
			// Create two users with different schedules
			const userAId = await createTestUser(db, { name: 'User A' });
			const userBId = await createTestUser(db, { name: 'User B' });

			const scheduleAId = await createTestSchedule(db, { userId: userAId, name: 'Schedule A', setAsActive: true });
			const scheduleBId = await createTestSchedule(db, { userId: userBId, name: 'Schedule B', setAsActive: true });

			// Create clerkships
			const clerkshipA1 = await createClerkship(db, { name: 'Clerkship A1', clerkship_type: 'outpatient', required_days: 5 });
			const clerkshipA2 = await createClerkship(db, { name: 'Clerkship A2', clerkship_type: 'inpatient', required_days: 10 });
			const clerkshipB1 = await createClerkship(db, { name: 'Clerkship B1', clerkship_type: 'outpatient', required_days: 5 });

			// Associate clerkships with schedules
			await associateClerkshipWithSchedule(db, clerkshipA1.id, scheduleAId);
			await associateClerkshipWithSchedule(db, clerkshipA2.id, scheduleAId);
			await associateClerkshipWithSchedule(db, clerkshipB1.id, scheduleBId);

			// Get clerkships for Schedule A
			const clerkshipsA = await getClerkshipsBySchedule(db, scheduleAId);
			expect(clerkshipsA).toHaveLength(2);
			expect(clerkshipsA.map(c => c.id)).toContain(clerkshipA1.id);
			expect(clerkshipsA.map(c => c.id)).toContain(clerkshipA2.id);
			expect(clerkshipsA.map(c => c.id)).not.toContain(clerkshipB1.id);

			// Get clerkships for Schedule B
			const clerkshipsB = await getClerkshipsBySchedule(db, scheduleBId);
			expect(clerkshipsB).toHaveLength(1);
			expect(clerkshipsB.map(c => c.id)).toContain(clerkshipB1.id);
		});

		it('returns empty array when schedule has no associated clerkships', async () => {
			const userId = await createTestUser(db, { name: 'User' });
			const scheduleId = await createTestSchedule(db, { userId, name: 'Empty Schedule', setAsActive: true });

			// Create clerkship but don't associate with the schedule
			await createClerkship(db, { name: 'Some Clerkship', clerkship_type: 'outpatient', required_days: 5 });

			const clerkships = await getClerkshipsBySchedule(db, scheduleId);
			expect(clerkships).toEqual([]);
		});

		it('throws error when scheduleId is not provided', async () => {
			await expect(getClerkshipsBySchedule(db, '')).rejects.toThrow('Schedule ID is required');
		});
	});
});
