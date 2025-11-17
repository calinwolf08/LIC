// @ts-nocheck
/**
 * Student Service Tests
 *
 * Tests for student database operations and business logic
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import {
	getStudents,
	getStudentById,
	getStudentByEmail,
	createStudent,
	updateStudent,
	deleteStudent,
	canDeleteStudent,
	studentExists,
	isEmailTaken
} from './student-service';
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
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
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

// Helper to create mock student
function createMockStudentData(overrides: Partial<{
	name: string;
	email: string;
}> = {}) {
	return {
		name: overrides.name ?? 'John Doe',
		email: overrides.email ?? 'john@example.com'
	};
}

describe('Student Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterAll(async () => {
		await db.destroy();
	});

	describe('getStudents()', () => {
		it('returns all students', async () => {
			// Create test students
			await createStudent(db, createMockStudentData({ name: 'Alice', email: 'alice@example.com' }));
			await createStudent(db, createMockStudentData({ name: 'Bob', email: 'bob@example.com' }));

			const students = await getStudents(db);

			expect(students).toHaveLength(2);
			expect(students.some(s => s.name === 'Alice')).toBe(true);
			expect(students.some(s => s.name === 'Bob')).toBe(true);
		});

		it('returns empty array when no students', async () => {
			const students = await getStudents(db);
			expect(students).toEqual([]);
		});

		it('returns students ordered by name', async () => {
			// Create students in reverse alphabetical order
			await createStudent(db, createMockStudentData({ name: 'Zoe', email: 'zoe@example.com' }));
			await createStudent(db, createMockStudentData({ name: 'Alice', email: 'alice@example.com' }));
			await createStudent(db, createMockStudentData({ name: 'Bob', email: 'bob@example.com' }));

			const students = await getStudents(db);

			expect(students[0].name).toBe('Alice');
			expect(students[1].name).toBe('Bob');
			expect(students[2].name).toBe('Zoe');
		});
	});

	describe('getStudentById()', () => {
		it('returns student when found', async () => {
			const created = await createStudent(db, createMockStudentData());
			const found = await getStudentById(db, created.id);

			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.name).toBe('John Doe');
		});

		it('returns null when not found', async () => {
			const found = await getStudentById(db, 'non-existent-id');
			expect(found).toBeNull();
		});

		it('returns correct student data', async () => {
			const created = await createStudent(db, createMockStudentData({
				name: 'Jane Doe',
				email: 'jane@example.com'
			}));

			const found = await getStudentById(db, created.id);

			expect(found?.name).toBe('Jane Doe');
			expect(found?.email).toBe('jane@example.com');
			expect(found?.created_at).toBeDefined();
			expect(found?.updated_at).toBeDefined();
		});
	});

	describe('getStudentByEmail()', () => {
		it('returns student when found', async () => {
			await createStudent(db, createMockStudentData({ email: 'test@example.com' }));
			const found = await getStudentByEmail(db, 'test@example.com');

			expect(found).not.toBeNull();
			expect(found?.email).toBe('test@example.com');
		});

		it('returns null when not found', async () => {
			const found = await getStudentByEmail(db, 'nonexistent@example.com');
			expect(found).toBeNull();
		});

		it('case-insensitive email matching', async () => {
			await createStudent(db, createMockStudentData({ email: 'Test@Example.com' }));

			const foundLower = await getStudentByEmail(db, 'test@example.com');
			const foundUpper = await getStudentByEmail(db, 'TEST@EXAMPLE.COM');
			const foundMixed = await getStudentByEmail(db, 'TeSt@ExAmPlE.cOm');

			expect(foundLower).not.toBeNull();
			expect(foundUpper).not.toBeNull();
			expect(foundMixed).not.toBeNull();
		});
	});

	describe('createStudent()', () => {
		it('creates student with valid data', async () => {
			const data = createMockStudentData();
			const student = await createStudent(db, data);

			expect(student).toBeDefined();
			expect(student.name).toBe(data.name);
			expect(student.email).toBe(data.email);
		});

		it('generates UUID for new student', async () => {
			const student = await createStudent(db, createMockStudentData());

			expect(student.id).toBeDefined();
			expect(student.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		});

		it('sets created_at and updated_at timestamps', async () => {
			const student = await createStudent(db, createMockStudentData());

			expect(student.created_at).toBeDefined();
			expect(student.updated_at).toBeDefined();
			expect(new Date(student.created_at).getTime()).toBeGreaterThan(0);
			expect(new Date(student.updated_at).getTime()).toBeGreaterThan(0);
		});

		it('throws ConflictError if email already exists', async () => {
			const data = createMockStudentData({ email: 'duplicate@example.com' });
			await createStudent(db, data);

			await expect(createStudent(db, data)).rejects.toThrow(ConflictError);
			await expect(createStudent(db, data)).rejects.toThrow('Email already exists');
		});

		it('returns created student with all fields', async () => {
			const data = createMockStudentData();
			const student = await createStudent(db, data);

			expect(student).toHaveProperty('id');
			expect(student).toHaveProperty('name');
			expect(student).toHaveProperty('email');
			expect(student).toHaveProperty('created_at');
			expect(student).toHaveProperty('updated_at');
		});
	});

	describe('updateStudent()', () => {
		it('updates student name', async () => {
			const created = await createStudent(db, createMockStudentData());
			const updated = await updateStudent(db, created.id, { name: 'Updated Name' });

			expect(updated.name).toBe('Updated Name');
			expect(updated.email).toBe(created.email);
		});

		it('updates student email', async () => {
			const created = await createStudent(db, createMockStudentData());
			const updated = await updateStudent(db, created.id, { email: 'newemail@example.com' });

			expect(updated.email).toBe('newemail@example.com');
			expect(updated.name).toBe(created.name);
		});

		it('updates both name and email', async () => {
			const created = await createStudent(db, createMockStudentData());
			const updated = await updateStudent(db, created.id, {
				name: 'New Name',
				email: 'newemail@example.com'
			});

			expect(updated.name).toBe('New Name');
			expect(updated.email).toBe('newemail@example.com');
		});

		it('updates updated_at timestamp', async () => {
			const created = await createStudent(db, createMockStudentData());

			// Wait a bit to ensure timestamp difference
			await new Promise(resolve => setTimeout(resolve, 10));

			const updated = await updateStudent(db, created.id, { name: 'Updated' });

			expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
				new Date(created.updated_at).getTime()
			);
		});

		it('throws NotFoundError if student not found', async () => {
			await expect(updateStudent(db, 'non-existent-id', { name: 'Test' })).rejects.toThrow(NotFoundError);
			await expect(updateStudent(db, 'non-existent-id', { name: 'Test' })).rejects.toThrow('Student');
		});

		it('throws ConflictError if new email is taken', async () => {
			await createStudent(db, createMockStudentData({ email: 'existing@example.com' }));
			const student2 = await createStudent(db, createMockStudentData({ email: 'other@example.com' }));

			await expect(
				updateStudent(db, student2.id, { email: 'existing@example.com' })
			).rejects.toThrow(ConflictError);
		});

		it('allows keeping same email (excludes self from check)', async () => {
			const created = await createStudent(db, createMockStudentData({ email: 'same@example.com' }));

			// This should not throw even though email already exists (it's the same student)
			const updated = await updateStudent(db, created.id, {
				name: 'Updated Name',
				email: 'same@example.com'
			});

			expect(updated.name).toBe('Updated Name');
			expect(updated.email).toBe('same@example.com');
		});

		it('returns updated student', async () => {
			const created = await createStudent(db, createMockStudentData());
			const updated = await updateStudent(db, created.id, { name: 'Updated' });

			expect(updated.id).toBe(created.id);
			expect(updated.name).toBe('Updated');
		});
	});

	describe('deleteStudent()', () => {
		it('deletes student successfully', async () => {
			const created = await createStudent(db, createMockStudentData());

			await deleteStudent(db, created.id);

			const found = await getStudentById(db, created.id);
			expect(found).toBeNull();
		});

		it('throws NotFoundError if student not found', async () => {
			await expect(deleteStudent(db, 'non-existent-id')).rejects.toThrow(NotFoundError);
			await expect(deleteStudent(db, 'non-existent-id')).rejects.toThrow('Student');
		});

		it('throws ConflictError if student has assignments', async () => {
			const student = await createStudent(db, createMockStudentData());

			// Create a schedule assignment for this student
			await db.insertInto('schedule_assignments').values({
				id: crypto.randomUUID(),
				student_id: student.id,
				preceptor_id: crypto.randomUUID(),
				clerkship_id: crypto.randomUUID(),
				date: '2024-01-01',
				status: 'scheduled',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();

			await expect(deleteStudent(db, student.id)).rejects.toThrow(ConflictError);
			await expect(deleteStudent(db, student.id)).rejects.toThrow('schedule assignments');
		});

		it('actually removes student from database', async () => {
			const created = await createStudent(db, createMockStudentData());

			await deleteStudent(db, created.id);

			const students = await getStudents(db);
			expect(students).toHaveLength(0);
		});
	});

	describe('canDeleteStudent()', () => {
		it('returns true when student has no assignments', async () => {
			const student = await createStudent(db, createMockStudentData());
			const canDelete = await canDeleteStudent(db, student.id);

			expect(canDelete).toBe(true);
		});

		it('returns false when student has assignments', async () => {
			const student = await createStudent(db, createMockStudentData());

			// Create assignment
			await db.insertInto('schedule_assignments').values({
				id: crypto.randomUUID(),
				student_id: student.id,
				preceptor_id: crypto.randomUUID(),
				clerkship_id: crypto.randomUUID(),
				date: '2024-01-01',
				status: 'scheduled',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();

			const canDelete = await canDeleteStudent(db, student.id);
			expect(canDelete).toBe(false);
		});
	});

	describe('studentExists()', () => {
		it('returns true when student exists', async () => {
			const created = await createStudent(db, createMockStudentData());
			const exists = await studentExists(db, created.id);

			expect(exists).toBe(true);
		});

		it('returns false when student does not exist', async () => {
			const exists = await studentExists(db, 'non-existent-id');
			expect(exists).toBe(false);
		});
	});

	describe('isEmailTaken()', () => {
		it('returns true when email exists', async () => {
			await createStudent(db, createMockStudentData({ email: 'taken@example.com' }));
			const taken = await isEmailTaken(db, 'taken@example.com');

			expect(taken).toBe(true);
		});

		it('returns false when email does not exist', async () => {
			const taken = await isEmailTaken(db, 'available@example.com');
			expect(taken).toBe(false);
		});

		it('case-insensitive email check', async () => {
			await createStudent(db, createMockStudentData({ email: 'Test@Example.com' }));

			const takenLower = await isEmailTaken(db, 'test@example.com');
			const takenUpper = await isEmailTaken(db, 'TEST@EXAMPLE.COM');

			expect(takenLower).toBe(true);
			expect(takenUpper).toBe(true);
		});

		it('excludes student when excludeId provided', async () => {
			const student = await createStudent(db, createMockStudentData({ email: 'test@example.com' }));

			// Should return false because we're excluding this student
			const taken = await isEmailTaken(db, 'test@example.com', student.id);
			expect(taken).toBe(false);
		});

		it('returns true when email taken by another student (with excludeId)', async () => {
			const student1 = await createStudent(db, createMockStudentData({ email: 'student1@example.com' }));
			const student2 = await createStudent(db, createMockStudentData({ email: 'student2@example.com' }));

			// Checking if student1's email is taken while excluding student2
			const taken = await isEmailTaken(db, 'student1@example.com', student2.id);
			expect(taken).toBe(true);
		});
	});
});
