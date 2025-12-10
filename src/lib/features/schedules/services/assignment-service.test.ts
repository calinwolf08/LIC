// @ts-nocheck
/**
 * Schedule Assignment Service Tests
 *
 * Tests for schedule assignment business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import {
	getAssignments,
	getAssignmentById,
	getAssignmentsByStudent,
	getAssignmentsByPreceptor,
	getAssignmentsByDateRange,
	createAssignment,
	updateAssignment,
	deleteAssignment,
	bulkCreateAssignments,
	hasStudentConflict,
	hasPreceptorConflict,
	validateAssignment,
	getStudentProgress,
	assignmentExists
} from './assignment-service';
import { NotFoundError, ValidationError } from '$lib/api/errors';

/**
 * Create test database with in-memory SQLite
 */
function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	return new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite
		})
	});
}

/**
 * Initialize database schema for tests
 */
async function initializeSchema(db: Kysely<DB>) {
	// Create students table
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create preceptors table
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('is_global_fallback_only', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create clerkships table
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

	// Create schedule_assignments table
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

	// Create blackout_dates table
	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create preceptor_availability table
	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

/**
 * Helper to create mock student
 */
function createMockStudent(overrides: any = {}) {
	return {
		id: crypto.randomUUID(),
		name: 'John Doe',
		email: 'john@example.com',
		cohort: '2024',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

/**
 * Helper to create mock preceptor
 */
function createMockPreceptor(overrides: any = {}) {
	return {
		id: crypto.randomUUID(),
		name: 'Dr. Smith',
		email: 'smith@example.com',
		specialty: 'Cardiology',
		max_students: 2,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

/**
 * Helper to create mock clerkship
 */
function createMockClerkship(overrides: any = {}) {
	return {
		id: crypto.randomUUID(),
		name: 'Cardiology Rotation',
		specialty: 'Cardiology',
		required_days: 10,
		description: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

/**
 * Helper to create mock assignment
 * Default date is 7 days in the future to avoid date protection issues
 */
function createMockAssignment(overrides: any = {}) {
	// Default to a future date (7 days from now)
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 7);
	const defaultDate = futureDate.toISOString().split('T')[0];

	return {
		id: crypto.randomUUID(),
		student_id: crypto.randomUUID(),
		preceptor_id: crypto.randomUUID(),
		clerkship_id: crypto.randomUUID(),
		date: defaultDate,
		status: 'scheduled',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

describe('Assignment Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getAssignments()', () => {
		it('returns all assignments ordered by date', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-15' });
			const assignment2 = createMockAssignment({ date: '2024-01-10' });
			const assignment3 = createMockAssignment({ date: '2024-01-20' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignments(db);

			expect(result).toHaveLength(3);
			expect(result[0].date).toBe('2024-01-10');
			expect(result[1].date).toBe('2024-01-15');
			expect(result[2].date).toBe('2024-01-20');
		});

		it('returns empty array when no assignments exist', async () => {
			const result = await getAssignments(db);
			expect(result).toEqual([]);
		});

		it('filters by student_id', async () => {
			const studentId = 'student-123';
			const assignment1 = createMockAssignment({ student_id: studentId });
			const assignment2 = createMockAssignment({ student_id: 'other-student' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			const result = await getAssignments(db, { student_id: studentId });

			expect(result).toHaveLength(1);
			expect(result[0].student_id).toBe(studentId);
		});

		it('filters by preceptor_id', async () => {
			const preceptorId = 'preceptor-123';
			const assignment1 = createMockAssignment({ preceptor_id: preceptorId });
			const assignment2 = createMockAssignment({ preceptor_id: 'other-preceptor' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			const result = await getAssignments(db, { preceptor_id: preceptorId });

			expect(result).toHaveLength(1);
			expect(result[0].preceptor_id).toBe(preceptorId);
		});

		it('filters by clerkship_id', async () => {
			const clerkshipId = 'clerkship-123';
			const assignment1 = createMockAssignment({ clerkship_id: clerkshipId });
			const assignment2 = createMockAssignment({ clerkship_id: 'other-clerkship' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			const result = await getAssignments(db, { clerkship_id: clerkshipId });

			expect(result).toHaveLength(1);
			expect(result[0].clerkship_id).toBe(clerkshipId);
		});

		it('filters by date range (both start and end)', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-05' });
			const assignment2 = createMockAssignment({ date: '2024-01-15' });
			const assignment3 = createMockAssignment({ date: '2024-01-25' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignments(db, {
				start_date: '2024-01-10',
				end_date: '2024-01-20'
			});

			expect(result).toHaveLength(1);
			expect(result[0].date).toBe('2024-01-15');
		});

		it('filters by start_date only', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-05' });
			const assignment2 = createMockAssignment({ date: '2024-01-15' });
			const assignment3 = createMockAssignment({ date: '2024-01-25' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignments(db, { start_date: '2024-01-10' });

			expect(result).toHaveLength(2);
			expect(result[0].date).toBe('2024-01-15');
			expect(result[1].date).toBe('2024-01-25');
		});

		it('filters by end_date only', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-05' });
			const assignment2 = createMockAssignment({ date: '2024-01-15' });
			const assignment3 = createMockAssignment({ date: '2024-01-25' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignments(db, { end_date: '2024-01-20' });

			expect(result).toHaveLength(2);
			expect(result[0].date).toBe('2024-01-05');
			expect(result[1].date).toBe('2024-01-15');
		});

		it('filters by multiple criteria simultaneously', async () => {
			const studentId = 'student-123';
			const clerkshipId = 'clerkship-123';
			const assignment1 = createMockAssignment({
				student_id: studentId,
				clerkship_id: clerkshipId,
				date: '2024-01-15'
			});
			const assignment2 = createMockAssignment({
				student_id: studentId,
				clerkship_id: 'other-clerkship',
				date: '2024-01-15'
			});
			const assignment3 = createMockAssignment({
				student_id: 'other-student',
				clerkship_id: clerkshipId,
				date: '2024-01-15'
			});

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignments(db, {
				student_id: studentId,
				clerkship_id: clerkshipId
			});

			expect(result).toHaveLength(1);
			expect(result[0].student_id).toBe(studentId);
			expect(result[0].clerkship_id).toBe(clerkshipId);
		});
	});

	describe('getAssignmentById()', () => {
		it('returns assignment when found', async () => {
			const assignment = createMockAssignment();
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await getAssignmentById(db, assignment.id);

			expect(result).not.toBeNull();
			expect(result?.id).toBe(assignment.id);
		});

		it('returns null when assignment not found', async () => {
			const result = await getAssignmentById(db, 'non-existent-id');
			expect(result).toBeNull();
		});
	});

	describe('getAssignmentsByStudent()', () => {
		it('returns all assignments for a student ordered by date', async () => {
			const studentId = 'student-123';
			const assignment1 = createMockAssignment({ student_id: studentId, date: '2024-01-20' });
			const assignment2 = createMockAssignment({ student_id: studentId, date: '2024-01-10' });
			const assignment3 = createMockAssignment({ student_id: 'other-student', date: '2024-01-15' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignmentsByStudent(db, studentId);

			expect(result).toHaveLength(2);
			expect(result[0].date).toBe('2024-01-10');
			expect(result[1].date).toBe('2024-01-20');
			expect(result.every((a) => a.student_id === studentId)).toBe(true);
		});

		it('returns empty array when student has no assignments', async () => {
			const result = await getAssignmentsByStudent(db, 'student-123');
			expect(result).toEqual([]);
		});
	});

	describe('getAssignmentsByPreceptor()', () => {
		it('returns all assignments for a preceptor ordered by date', async () => {
			const preceptorId = 'preceptor-123';
			const assignment1 = createMockAssignment({ preceptor_id: preceptorId, date: '2024-01-20' });
			const assignment2 = createMockAssignment({ preceptor_id: preceptorId, date: '2024-01-10' });
			const assignment3 = createMockAssignment({ preceptor_id: 'other-preceptor', date: '2024-01-15' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignmentsByPreceptor(db, preceptorId);

			expect(result).toHaveLength(2);
			expect(result[0].date).toBe('2024-01-10');
			expect(result[1].date).toBe('2024-01-20');
			expect(result.every((a) => a.preceptor_id === preceptorId)).toBe(true);
		});

		it('returns empty array when preceptor has no assignments', async () => {
			const result = await getAssignmentsByPreceptor(db, 'preceptor-123');
			expect(result).toEqual([]);
		});
	});

	describe('getAssignmentsByDateRange()', () => {
		it('returns assignments within date range', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-05' });
			const assignment2 = createMockAssignment({ date: '2024-01-15' });
			const assignment3 = createMockAssignment({ date: '2024-01-25' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignmentsByDateRange(db, '2024-01-10', '2024-01-20');

			expect(result).toHaveLength(1);
			expect(result[0].date).toBe('2024-01-15');
		});

		it('includes boundary dates', async () => {
			const assignment1 = createMockAssignment({ date: '2024-01-10' });
			const assignment2 = createMockAssignment({ date: '2024-01-15' });
			const assignment3 = createMockAssignment({ date: '2024-01-20' });

			await db.insertInto('schedule_assignments').values([assignment1, assignment2, assignment3]).execute();

			const result = await getAssignmentsByDateRange(db, '2024-01-10', '2024-01-20');

			expect(result).toHaveLength(3);
		});

		it('returns empty array when no assignments in range', async () => {
			const assignment = createMockAssignment({ date: '2024-01-05' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await getAssignmentsByDateRange(db, '2024-01-10', '2024-01-20');

			expect(result).toEqual([]);
		});
	});

	describe('createAssignment()', () => {
		it('creates valid assignment successfully', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			const result = await createAssignment(db, assignmentData);

			expect(result).toBeDefined();
			expect(result.student_id).toBe(student.id);
			expect(result.preceptor_id).toBe(preceptor.id);
			expect(result.clerkship_id).toBe(clerkship.id);
			expect(result.date).toBe('2024-01-15');
			expect(result.status).toBe('scheduled');
		});

		it('creates assignment with explicit status', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15',
				status: 'completed'
			};

			const result = await createAssignment(db, assignmentData);

			expect(result.status).toBe('completed');
		});

		it('throws ValidationError when student not found', async () => {
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: 'non-existent-student',
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('Student not found');
		});

		it('throws ValidationError when preceptor not found', async () => {
			const student = createMockStudent();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: 'non-existent-preceptor',
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('Preceptor not found');
		});

		it('throws ValidationError when clerkship not found', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: 'non-existent-clerkship',
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('Clerkship not found');
		});

		// NOTE: Specialty matching was removed - preceptors no longer have specialty field
		// This test is kept as a placeholder to document the change in behavior
		it('allows assignment regardless of clerkship type (specialty matching removed)', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			// Assignment should succeed - no specialty matching is performed
			const result = await createAssignment(db, assignmentData);
			expect(result).toBeDefined();
			expect(result.student_id).toBe(student.id);
		});

		it('throws ValidationError when student has conflict on same date', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Create existing assignment
			const existingAssignment = createMockAssignment({
				student_id: student.id,
				date: '2024-01-15'
			});
			await db.insertInto('schedule_assignments').values(existingAssignment).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('already has an assignment');
		});

		it('throws ValidationError when preceptor at capacity', async () => {
			const student1 = createMockStudent();
			const student2 = createMockStudent();
			const preceptor = createMockPreceptor({ max_students: 1 });
			const clerkship = createMockClerkship();

			await db.insertInto('students').values([student1, student2]).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Create existing assignment at capacity
			const existingAssignment = createMockAssignment({
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});
			await db.insertInto('schedule_assignments').values(existingAssignment).execute();

			const assignmentData = {
				student_id: student2.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('maximum student capacity');
		});

		it('throws ValidationError when preceptor not available', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Mark preceptor as unavailable on this date
			await db
				.insertInto('preceptor_availability')
				.values({
					id: crypto.randomUUID(),
					preceptor_id: preceptor.id,
					date: '2024-01-15',
					is_available: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('not available');
		});

		it('throws ValidationError when date is blacked out', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Add blackout date
			await db
				.insertInto('blackout_dates')
				.values({
					id: crypto.randomUUID(),
					date: '2024-01-15',
					reason: 'Holiday',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			await expect(createAssignment(db, assignmentData)).rejects.toThrow(ValidationError);
			await expect(createAssignment(db, assignmentData)).rejects.toThrow('blackout date');
		});
	});

	describe('updateAssignment()', () => {
		it('updates assignment status successfully', async () => {
			const assignment = createMockAssignment({ status: 'scheduled' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await updateAssignment(db, assignment.id, { status: 'completed' });

			expect(result.status).toBe('completed');
			expect(result.id).toBe(assignment.id);
		});

		it('updates assignment date successfully', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Use future dates
			const futureDate1 = new Date();
			futureDate1.setDate(futureDate1.getDate() + 10);
			const futureDate2 = new Date();
			futureDate2.setDate(futureDate2.getDate() + 11);

			const assignment = createMockAssignment({
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: futureDate1.toISOString().split('T')[0]
			});
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await updateAssignment(db, assignment.id, {
				date: futureDate2.toISOString().split('T')[0]
			});

			expect(result.date).toBe(futureDate2.toISOString().split('T')[0]);
		});

		it('throws NotFoundError when assignment does not exist', async () => {
			await expect(updateAssignment(db, 'non-existent-id', { status: 'completed' })).rejects.toThrow(
				NotFoundError
			);
		});

		it('validates updated assignment for conflicts', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Create two assignments
			const assignment1 = createMockAssignment({
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});
			const assignment2 = createMockAssignment({
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-16'
			});

			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			// Try to update assignment2 to same date as assignment1
			await expect(updateAssignment(db, assignment2.id, { date: '2024-01-15' })).rejects.toThrow(
				ValidationError
			);
		});

		it('allows updating to same date (no self-conflict)', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Use future date
			const futureDate = new Date();
			futureDate.setDate(futureDate.getDate() + 10);
			const dateString = futureDate.toISOString().split('T')[0];

			const assignment = createMockAssignment({
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: dateString,
				status: 'scheduled'
			});

			await db.insertInto('schedule_assignments').values(assignment).execute();

			// Update status while keeping same date - should succeed
			const result = await updateAssignment(db, assignment.id, {
				date: dateString,
				status: 'completed'
			});

			expect(result.status).toBe('completed');
			expect(result.date).toBe(dateString);
		});
	});

	describe('deleteAssignment()', () => {
		it('deletes assignment successfully', async () => {
			const assignment = createMockAssignment();
			await db.insertInto('schedule_assignments').values(assignment).execute();

			await deleteAssignment(db, assignment.id);

			const result = await getAssignmentById(db, assignment.id);
			expect(result).toBeNull();
		});

		it('throws NotFoundError when assignment does not exist', async () => {
			await expect(deleteAssignment(db, 'non-existent-id')).rejects.toThrow(NotFoundError);
		});
	});

	describe('bulkCreateAssignments()', () => {
		it('creates multiple assignments successfully', async () => {
			const assignments = [
				{
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2024-01-15'
				},
				{
					student_id: 'student-2',
					preceptor_id: 'preceptor-2',
					clerkship_id: 'clerkship-2',
					date: '2024-01-16'
				}
			];

			const result = await bulkCreateAssignments(db, { assignments });

			expect(result).toHaveLength(2);
			expect(result[0].student_id).toBe('student-1');
			expect(result[1].student_id).toBe('student-2');
		});

		it('creates empty array when no assignments provided', async () => {
			const result = await bulkCreateAssignments(db, { assignments: [] });
			expect(result).toEqual([]);
		});

		it('assigns default status to all assignments', async () => {
			const assignments = [
				{
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2024-01-15'
				}
			];

			const result = await bulkCreateAssignments(db, { assignments });

			expect(result[0].status).toBe('scheduled');
		});
	});

	describe('hasStudentConflict()', () => {
		it('returns true when student has assignment on same date', async () => {
			const studentId = 'student-123';
			const assignment = createMockAssignment({ student_id: studentId, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasStudentConflict(db, studentId, '2024-01-15');

			expect(result).toBe(true);
		});

		it('returns false when student has no assignment on date', async () => {
			const studentId = 'student-123';
			const assignment = createMockAssignment({ student_id: studentId, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasStudentConflict(db, studentId, '2024-01-16');

			expect(result).toBe(false);
		});

		it('excludes specified assignment ID from conflict check', async () => {
			const studentId = 'student-123';
			const assignment = createMockAssignment({ student_id: studentId, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasStudentConflict(db, studentId, '2024-01-15', assignment.id);

			expect(result).toBe(false);
		});

		it('detects conflict even when excluding different assignment', async () => {
			const studentId = 'student-123';
			const assignment1 = createMockAssignment({ student_id: studentId, date: '2024-01-15' });
			const assignment2 = createMockAssignment({ student_id: studentId, date: '2024-01-16' });
			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			const result = await hasStudentConflict(db, studentId, '2024-01-15', assignment2.id);

			expect(result).toBe(true);
		});
	});

	describe('hasPreceptorConflict()', () => {
		it('returns false when preceptor under capacity', async () => {
			const preceptor = createMockPreceptor({ max_students: 2 });
			await db.insertInto('preceptors').values(preceptor).execute();

			const assignment = createMockAssignment({ preceptor_id: preceptor.id, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasPreceptorConflict(db, preceptor.id, '2024-01-15');

			expect(result).toBe(false);
		});

		it('returns true when preceptor at capacity', async () => {
			const preceptor = createMockPreceptor({ max_students: 1 });
			await db.insertInto('preceptors').values(preceptor).execute();

			const assignment = createMockAssignment({ preceptor_id: preceptor.id, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasPreceptorConflict(db, preceptor.id, '2024-01-15');

			expect(result).toBe(true);
		});

		it('returns true when preceptor not found', async () => {
			const result = await hasPreceptorConflict(db, 'non-existent-preceptor', '2024-01-15');
			expect(result).toBe(true);
		});

		it('excludes specified assignment ID from capacity check', async () => {
			const preceptor = createMockPreceptor({ max_students: 1 });
			await db.insertInto('preceptors').values(preceptor).execute();

			const assignment = createMockAssignment({ preceptor_id: preceptor.id, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await hasPreceptorConflict(db, preceptor.id, '2024-01-15', assignment.id);

			expect(result).toBe(false);
		});

		it('detects capacity conflict with multiple assignments', async () => {
			const preceptor = createMockPreceptor({ max_students: 2 });
			await db.insertInto('preceptors').values(preceptor).execute();

			const assignment1 = createMockAssignment({ preceptor_id: preceptor.id, date: '2024-01-15' });
			const assignment2 = createMockAssignment({ preceptor_id: preceptor.id, date: '2024-01-15' });
			await db.insertInto('schedule_assignments').values([assignment1, assignment2]).execute();

			const result = await hasPreceptorConflict(db, preceptor.id, '2024-01-15');

			expect(result).toBe(true);
		});
	});

	describe('validateAssignment()', () => {
		it('returns valid for valid assignment', async () => {
			const student = createMockStudent();
			const preceptor = createMockPreceptor({ specialty: 'Cardiology' });
			const clerkship = createMockClerkship({ specialty: 'Cardiology' });

			await db.insertInto('students').values(student).execute();
			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			const result = await validateAssignment(db, assignmentData);

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it('returns error when student not found', async () => {
			const preceptor = createMockPreceptor();
			const clerkship = createMockClerkship();

			await db.insertInto('preceptors').values(preceptor).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const assignmentData = {
				student_id: 'non-existent-student',
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			const result = await validateAssignment(db, assignmentData);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Student not found');
		});

		it('returns multiple errors when multiple validations fail', async () => {
			const assignmentData = {
				student_id: 'non-existent-student',
				preceptor_id: 'non-existent-preceptor',
				clerkship_id: 'non-existent-clerkship',
				date: '2024-01-15'
			};

			const result = await validateAssignment(db, assignmentData);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(3);
			expect(result.errors).toContain('Student not found');
			expect(result.errors).toContain('Preceptor not found');
			expect(result.errors).toContain('Clerkship not found');
		});
	});

	describe('getStudentProgress()', () => {
		it('calculates progress for all clerkships', async () => {
			const student = createMockStudent();
			const clerkship1 = createMockClerkship({ name: 'Cardiology', required_days: 10 });
			const clerkship2 = createMockClerkship({ name: 'Neurology', required_days: 5 });

			await db.insertInto('students').values(student).execute();
			await db.insertInto('clerkships').values([clerkship1, clerkship2]).execute();

			// Add 5 assignments for cardiology, 3 for neurology
			const assignments = [
				...Array(5).fill(null).map(() => createMockAssignment({ student_id: student.id, clerkship_id: clerkship1.id })),
				...Array(3).fill(null).map(() => createMockAssignment({ student_id: student.id, clerkship_id: clerkship2.id }))
			];
			await db.insertInto('schedule_assignments').values(assignments).execute();

			const result = await getStudentProgress(db, student.id);

			expect(result).toHaveLength(2);

			const cardiology = result.find((p) => p.clerkship_id === clerkship1.id);
			expect(cardiology?.completed_days).toBe(5);
			expect(cardiology?.required_days).toBe(10);
			expect(cardiology?.percentage).toBe(50);

			const neurology = result.find((p) => p.clerkship_id === clerkship2.id);
			expect(neurology?.completed_days).toBe(3);
			expect(neurology?.required_days).toBe(5);
			expect(neurology?.percentage).toBe(60);
		});

		it('returns 0 progress when no assignments', async () => {
			const student = createMockStudent();
			const clerkship = createMockClerkship({ required_days: 10 });

			await db.insertInto('students').values(student).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			const result = await getStudentProgress(db, student.id);

			expect(result).toHaveLength(1);
			expect(result[0].completed_days).toBe(0);
			expect(result[0].percentage).toBe(0);
		});

		it('caps percentage at 100 when exceeding requirements', async () => {
			const student = createMockStudent();
			const clerkship = createMockClerkship({ required_days: 5 });

			await db.insertInto('students').values(student).execute();
			await db.insertInto('clerkships').values(clerkship).execute();

			// Add 10 assignments (exceeding requirement of 5)
			const assignments = Array(10).fill(null).map(() =>
				createMockAssignment({ student_id: student.id, clerkship_id: clerkship.id })
			);
			await db.insertInto('schedule_assignments').values(assignments).execute();

			const result = await getStudentProgress(db, student.id);

			expect(result[0].completed_days).toBe(10);
			expect(result[0].percentage).toBe(100);
		});
	});

	describe('assignmentExists()', () => {
		it('returns true when assignment exists', async () => {
			const assignment = createMockAssignment();
			await db.insertInto('schedule_assignments').values(assignment).execute();

			const result = await assignmentExists(db, assignment.id);

			expect(result).toBe(true);
		});

		it('returns false when assignment does not exist', async () => {
			const result = await assignmentExists(db, 'non-existent-id');
			expect(result).toBe(false);
		});
	});
});
