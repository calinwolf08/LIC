// @ts-nocheck
/**
 * Preceptor Service Tests
 *
 * Tests for preceptor database operations and business logic
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import {
	getPreceptors,
	getPreceptorById,
	getPreceptorsBySpecialty,
	getPreceptorByEmail,
	createPreceptor,
	updatePreceptor,
	deletePreceptor,
	canDeletePreceptor,
	preceptorExists,
	isEmailTaken
} from './preceptor-service';
import { NotFoundError, ConflictError } from '$lib/api/errors';

// Create test database
function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite
		})
	});

	return db;
}

// Initialize database schema
async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull())
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
		.addColumn('status', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

// Helper to create mock preceptor
function createMockPreceptorData(overrides: Partial<{
	name: string;
	email: string;
	specialty: string;
	max_students: number;
}> = {}) {
	return {
		name: overrides.name ?? 'Dr. Smith',
		email: overrides.email ?? 'smith@example.com',
		specialty: overrides.specialty ?? 'Family Medicine',
		max_students: overrides.max_students ?? 2
	};
}

describe('Preceptor Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterAll(async () => {
		await db.destroy();
	});

	describe('getPreceptors()', () => {
		it('returns all preceptors', async () => {
			await createPreceptor(db, createMockPreceptorData({ name: 'Dr. Alice', email: 'alice@example.com' }));
			await createPreceptor(db, createMockPreceptorData({ name: 'Dr. Bob', email: 'bob@example.com' }));

			const preceptors = await getPreceptors(db);

			expect(preceptors).toHaveLength(2);
			expect(preceptors.some(p => p.name === 'Dr. Alice')).toBe(true);
			expect(preceptors.some(p => p.name === 'Dr. Bob')).toBe(true);
		});

		it('returns empty array when no preceptors', async () => {
			const preceptors = await getPreceptors(db);
			expect(preceptors).toEqual([]);
		});

		it('returns preceptors ordered by name', async () => {
			await createPreceptor(db, createMockPreceptorData({ name: 'Dr. Zoe', email: 'zoe@example.com' }));
			await createPreceptor(db, createMockPreceptorData({ name: 'Dr. Alice', email: 'alice@example.com' }));
			await createPreceptor(db, createMockPreceptorData({ name: 'Dr. Bob', email: 'bob@example.com' }));

			const preceptors = await getPreceptors(db);

			expect(preceptors[0].name).toBe('Dr. Alice');
			expect(preceptors[1].name).toBe('Dr. Bob');
			expect(preceptors[2].name).toBe('Dr. Zoe');
		});
	});

	describe('getPreceptorById()', () => {
		it('returns preceptor when found', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const found = await getPreceptorById(db, created.id);

			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.name).toBe('Dr. Smith');
		});

		it('returns null when not found', async () => {
			const found = await getPreceptorById(db, 'non-existent-id');
			expect(found).toBeNull();
		});

		it('returns correct preceptor data', async () => {
			const created = await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Johnson',
				email: 'johnson@example.com',
				specialty: 'Internal Medicine',
				max_students: 3
			}));

			const found = await getPreceptorById(db, created.id);

			expect(found?.name).toBe('Dr. Johnson');
			expect(found?.email).toBe('johnson@example.com');
			expect(found?.specialty).toBe('Internal Medicine');
			expect(found?.max_students).toBe(3);
			expect(found?.created_at).toBeDefined();
			expect(found?.updated_at).toBeDefined();
		});
	});

	describe('getPreceptorsBySpecialty()', () => {
		it('returns preceptors with matching specialty', async () => {
			await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine'
			}));
			await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Jones',
				email: 'jones@example.com',
				specialty: 'Family Medicine'
			}));
			await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Brown',
				email: 'brown@example.com',
				specialty: 'Internal Medicine'
			}));

			const familyDocs = await getPreceptorsBySpecialty(db, 'Family Medicine');

			expect(familyDocs).toHaveLength(2);
			expect(familyDocs.every(p => p.specialty === 'Family Medicine')).toBe(true);
		});

		it('returns empty array when no matching specialty', async () => {
			await createPreceptor(db, createMockPreceptorData({ specialty: 'Family Medicine' }));

			const result = await getPreceptorsBySpecialty(db, 'Cardiology');
			expect(result).toEqual([]);
		});

		it('returns preceptors ordered by name', async () => {
			await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Zoe',
				email: 'zoe@example.com',
				specialty: 'Family Medicine'
			}));
			await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Alice',
				email: 'alice@example.com',
				specialty: 'Family Medicine'
			}));

			const result = await getPreceptorsBySpecialty(db, 'Family Medicine');

			expect(result[0].name).toBe('Dr. Alice');
			expect(result[1].name).toBe('Dr. Zoe');
		});
	});

	describe('getPreceptorByEmail()', () => {
		it('returns preceptor when found', async () => {
			await createPreceptor(db, createMockPreceptorData({ email: 'test@example.com' }));
			const found = await getPreceptorByEmail(db, 'test@example.com');

			expect(found).not.toBeNull();
			expect(found?.email).toBe('test@example.com');
		});

		it('returns null when not found', async () => {
			const found = await getPreceptorByEmail(db, 'nonexistent@example.com');
			expect(found).toBeNull();
		});

		it('case-insensitive email matching', async () => {
			await createPreceptor(db, createMockPreceptorData({ email: 'Test@Example.com' }));

			const foundLower = await getPreceptorByEmail(db, 'test@example.com');
			const foundUpper = await getPreceptorByEmail(db, 'TEST@EXAMPLE.COM');
			const foundMixed = await getPreceptorByEmail(db, 'TeSt@ExAmPlE.cOm');

			expect(foundLower).not.toBeNull();
			expect(foundUpper).not.toBeNull();
			expect(foundMixed).not.toBeNull();
		});
	});

	describe('createPreceptor()', () => {
		it('creates preceptor with valid data', async () => {
			const data = createMockPreceptorData();
			const preceptor = await createPreceptor(db, data);

			expect(preceptor).toBeDefined();
			expect(preceptor.name).toBe(data.name);
			expect(preceptor.email).toBe(data.email);
			expect(preceptor.specialty).toBe(data.specialty);
			expect(preceptor.max_students).toBe(data.max_students);
		});

		it('generates UUID for new preceptor', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData());

			expect(preceptor.id).toBeDefined();
			expect(preceptor.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		});

		it('sets created_at and updated_at timestamps', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData());

			expect(preceptor.created_at).toBeDefined();
			expect(preceptor.updated_at).toBeDefined();
			expect(new Date(preceptor.created_at).getTime()).toBeGreaterThan(0);
			expect(new Date(preceptor.updated_at).getTime()).toBeGreaterThan(0);
		});

		it('throws ConflictError if email already exists', async () => {
			const data = createMockPreceptorData({ email: 'duplicate@example.com' });
			await createPreceptor(db, data);

			await expect(createPreceptor(db, data)).rejects.toThrow(ConflictError);
			await expect(createPreceptor(db, data)).rejects.toThrow('Email already exists');
		});

		it('defaults max_students to 1 if not provided', async () => {
			const data = {
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine'
			};
			const preceptor = await createPreceptor(db, data);

			expect(preceptor.max_students).toBe(1);
		});

		it('returns created preceptor with all fields', async () => {
			const data = createMockPreceptorData();
			const preceptor = await createPreceptor(db, data);

			expect(preceptor).toHaveProperty('id');
			expect(preceptor).toHaveProperty('name');
			expect(preceptor).toHaveProperty('email');
			expect(preceptor).toHaveProperty('specialty');
			expect(preceptor).toHaveProperty('max_students');
			expect(preceptor).toHaveProperty('created_at');
			expect(preceptor).toHaveProperty('updated_at');
		});
	});

	describe('updatePreceptor()', () => {
		it('updates preceptor name', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, { name: 'Dr. Updated' });

			expect(updated.name).toBe('Dr. Updated');
			expect(updated.email).toBe(created.email);
		});

		it('updates preceptor email', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, { email: 'newemail@example.com' });

			expect(updated.email).toBe('newemail@example.com');
			expect(updated.name).toBe(created.name);
		});

		it('updates preceptor specialty', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, { specialty: 'Internal Medicine' });

			expect(updated.specialty).toBe('Internal Medicine');
		});

		it('updates preceptor max_students', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, { max_students: 5 });

			expect(updated.max_students).toBe(5);
		});

		it('updates multiple fields', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, {
				name: 'Dr. New Name',
				email: 'newemail@example.com',
				specialty: 'Cardiology',
				max_students: 4
			});

			expect(updated.name).toBe('Dr. New Name');
			expect(updated.email).toBe('newemail@example.com');
			expect(updated.specialty).toBe('Cardiology');
			expect(updated.max_students).toBe(4);
		});

		it('updates updated_at timestamp', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());

			// Wait a bit to ensure timestamp difference
			await new Promise(resolve => setTimeout(resolve, 10));

			const updated = await updatePreceptor(db, created.id, { name: 'Updated' });

			expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
				new Date(created.updated_at).getTime()
			);
		});

		it('throws NotFoundError if preceptor not found', async () => {
			await expect(updatePreceptor(db, 'non-existent-id', { name: 'Test' })).rejects.toThrow(NotFoundError);
			await expect(updatePreceptor(db, 'non-existent-id', { name: 'Test' })).rejects.toThrow('Preceptor');
		});

		it('throws ConflictError if new email is taken', async () => {
			await createPreceptor(db, createMockPreceptorData({ email: 'existing@example.com' }));
			const preceptor2 = await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Other',
				email: 'other@example.com'
			}));

			await expect(
				updatePreceptor(db, preceptor2.id, { email: 'existing@example.com' })
			).rejects.toThrow(ConflictError);
		});

		it('allows keeping same email (excludes self from check)', async () => {
			const created = await createPreceptor(db, createMockPreceptorData({ email: 'same@example.com' }));

			const updated = await updatePreceptor(db, created.id, {
				name: 'Dr. Updated Name',
				email: 'same@example.com'
			});

			expect(updated.name).toBe('Dr. Updated Name');
			expect(updated.email).toBe('same@example.com');
		});

		it('returns updated preceptor', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const updated = await updatePreceptor(db, created.id, { name: 'Updated' });

			expect(updated.id).toBe(created.id);
			expect(updated.name).toBe('Updated');
		});
	});

	describe('deletePreceptor()', () => {
		it('deletes preceptor successfully', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());

			await deletePreceptor(db, created.id);

			const found = await getPreceptorById(db, created.id);
			expect(found).toBeNull();
		});

		it('throws NotFoundError if preceptor not found', async () => {
			await expect(deletePreceptor(db, 'non-existent-id')).rejects.toThrow(NotFoundError);
			await expect(deletePreceptor(db, 'non-existent-id')).rejects.toThrow('Preceptor');
		});

		it('throws ConflictError if preceptor has assignments', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData());

			// Create a schedule assignment
			await db.insertInto('schedule_assignments').values({
				id: crypto.randomUUID(),
				student_id: crypto.randomUUID(),
				preceptor_id: preceptor.id,
				clerkship_id: crypto.randomUUID(),
				date: '2024-01-01',
				status: 'scheduled',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();

			await expect(deletePreceptor(db, preceptor.id)).rejects.toThrow(ConflictError);
			await expect(deletePreceptor(db, preceptor.id)).rejects.toThrow('schedule assignments');
		});

		it('actually removes preceptor from database', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());

			await deletePreceptor(db, created.id);

			const preceptors = await getPreceptors(db);
			expect(preceptors).toHaveLength(0);
		});
	});

	describe('canDeletePreceptor()', () => {
		it('returns true when preceptor has no assignments', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData());
			const canDelete = await canDeletePreceptor(db, preceptor.id);

			expect(canDelete).toBe(true);
		});

		it('returns false when preceptor has assignments', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData());

			// Create assignment
			await db.insertInto('schedule_assignments').values({
				id: crypto.randomUUID(),
				student_id: crypto.randomUUID(),
				preceptor_id: preceptor.id,
				clerkship_id: crypto.randomUUID(),
				date: '2024-01-01',
				status: 'scheduled',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();

			const canDelete = await canDeletePreceptor(db, preceptor.id);
			expect(canDelete).toBe(false);
		});
	});

	describe('preceptorExists()', () => {
		it('returns true when preceptor exists', async () => {
			const created = await createPreceptor(db, createMockPreceptorData());
			const exists = await preceptorExists(db, created.id);

			expect(exists).toBe(true);
		});

		it('returns false when preceptor does not exist', async () => {
			const exists = await preceptorExists(db, 'non-existent-id');
			expect(exists).toBe(false);
		});
	});

	describe('isEmailTaken()', () => {
		it('returns true when email exists', async () => {
			await createPreceptor(db, createMockPreceptorData({ email: 'taken@example.com' }));
			const taken = await isEmailTaken(db, 'taken@example.com');

			expect(taken).toBe(true);
		});

		it('returns false when email does not exist', async () => {
			const taken = await isEmailTaken(db, 'available@example.com');
			expect(taken).toBe(false);
		});

		it('case-insensitive email check', async () => {
			await createPreceptor(db, createMockPreceptorData({ email: 'Test@Example.com' }));

			const takenLower = await isEmailTaken(db, 'test@example.com');
			const takenUpper = await isEmailTaken(db, 'TEST@EXAMPLE.COM');

			expect(takenLower).toBe(true);
			expect(takenUpper).toBe(true);
		});

		it('excludes preceptor when excludeId provided', async () => {
			const preceptor = await createPreceptor(db, createMockPreceptorData({ email: 'test@example.com' }));

			const taken = await isEmailTaken(db, 'test@example.com', preceptor.id);
			expect(taken).toBe(false);
		});

		it('returns true when email taken by another preceptor (with excludeId)', async () => {
			const preceptor1 = await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. One',
				email: 'preceptor1@example.com'
			}));
			const preceptor2 = await createPreceptor(db, createMockPreceptorData({
				name: 'Dr. Two',
				email: 'preceptor2@example.com'
			}));

			const taken = await isEmailTaken(db, 'preceptor1@example.com', preceptor2.id);
			expect(taken).toBe(true);
		});
	});
});
