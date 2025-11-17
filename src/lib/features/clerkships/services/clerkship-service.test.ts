/**
 * Clerkship Service Unit Tests
 *
 * Tests for clerkship business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, ClerkshipsTable } from '$lib/db/types';
import {
	getClerkships,
	getClerkshipById,
	getClerkshipsBySpecialty,
	getClerkshipByName,
	createClerkship,
	updateClerkship,
	deleteClerkship,
	canDeleteClerkship,
	clerkshipExists,
	isNameTaken
} from './clerkship-service';
import { NotFoundError, ConflictError } from '$lib/api/errors';

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
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('required_days', 'integer', (col) => col.notNull())
		.addColumn('description', 'text')
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
	overrides: Partial<Omit<ClerkshipsTable, 'id' | 'created_at' | 'updated_at'>> = {}
): Omit<ClerkshipsTable, 'id' | 'created_at' | 'updated_at'> {
	return {
		name: 'Family Medicine Clerkship',
		specialty: 'Family Medicine',
		required_days: 5,
		description: null,
		...overrides
	};
}

async function createClerkshipDirect(
	db: Kysely<DB>,
	data: Partial<ClerkshipsTable> = {}
): Promise<ClerkshipsTable> {
	const timestamp = new Date().toISOString();
	const clerkship: ClerkshipsTable = {
		id: crypto.randomUUID(),
		name: 'Family Medicine Clerkship',
		specialty: 'Family Medicine',
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
			await createClerkshipDirect(db, { name: 'FM Clerkship', specialty: 'Family Medicine' });
			await createClerkshipDirect(db, { name: 'IM Clerkship', specialty: 'Internal Medicine' });

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
				specialty: 'Surgery',
				required_days: 10,
				description: 'Test description'
			});

			const found = await getClerkshipById(db, created.id);
			expect(found?.specialty).toBe('Surgery');
			expect(found?.required_days).toBe(10);
			expect(found?.description).toBe('Test description');
		});
	});

	describe('getClerkshipsBySpecialty()', () => {
		it('returns clerkships with matching specialty', async () => {
			await createClerkshipDirect(db, {
				name: 'FM1',
				specialty: 'Family Medicine'
			});
			await createClerkshipDirect(db, {
				name: 'FM2',
				specialty: 'Family Medicine'
			});
			await createClerkshipDirect(db, {
				name: 'IM1',
				specialty: 'Internal Medicine'
			});

			const familyMedicine = await getClerkshipsBySpecialty(db, 'Family Medicine');
			expect(familyMedicine).toHaveLength(2);
			expect(familyMedicine.every((c) => c.specialty === 'Family Medicine')).toBe(true);
		});

		it('returns empty array when no matching specialty', async () => {
			await createClerkshipDirect(db, { specialty: 'Surgery' });

			const result = await getClerkshipsBySpecialty(db, 'Pediatrics');
			expect(result).toEqual([]);
		});

		it('is case-sensitive', async () => {
			await createClerkshipDirect(db, { specialty: 'Family Medicine' });

			const result = await getClerkshipsBySpecialty(db, 'family medicine');
			expect(result).toEqual([]);
		});

		it('returns clerkships ordered by name', async () => {
			await createClerkshipDirect(db, {
				name: 'Surgery 2',
				specialty: 'Surgery'
			});
			await createClerkshipDirect(db, {
				name: 'Surgery 1',
				specialty: 'Surgery'
			});

			const result = await getClerkshipsBySpecialty(db, 'Surgery');
			expect(result[0].name).toBe('Surgery 1');
			expect(result[1].name).toBe('Surgery 2');
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
				specialty: 'Pediatrics',
				required_days: 8
			});

			const created = await createClerkship(db, data);

			expect(created.id).toBeDefined();
			expect(created.name).toBe('New Clerkship');
			expect(created.specialty).toBe('Pediatrics');
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

		it('updates clerkship specialty', async () => {
			const clerkship = await createClerkshipDirect(db, { specialty: 'Family Medicine' });

			const updated = await updateClerkship(db, clerkship.id, {
				specialty: 'Internal Medicine'
			});

			expect(updated.specialty).toBe('Internal Medicine');
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
				specialty: 'Surgery',
				required_days: 15
			});

			expect(updated.name).toBe('New Name');
			expect(updated.specialty).toBe('Surgery');
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
