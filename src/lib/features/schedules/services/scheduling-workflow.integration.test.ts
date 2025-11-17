// @ts-nocheck
/**
 * Scheduling Workflow Integration Tests
 *
 * Tests the complete scheduling workflow across multiple services
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';

// Import all services
import { createStudent } from '$lib/features/students/services/student-service';
import { createPreceptor } from '$lib/features/preceptors/services/preceptor-service';
import { createClerkship } from '$lib/features/clerkships/services/clerkship-service';
import { createBlackoutDate } from '$lib/features/blackout-dates/services/blackout-date-service';
import { setAvailability } from '$lib/features/preceptors/services/availability-service';
import {
	createAssignment,
	getAssignmentsByStudent,
	getStudentProgress,
	validateAssignment
} from './assignment-service';

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
 * Initialize complete database schema for integration tests
 */
async function initializeSchema(db: Kysely<DB>) {
	// Students table
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptors table
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Clerkships table
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

	// Schedule assignments table
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

	// Blackout dates table
	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptor availability table
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

describe('Scheduling Workflow Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('Complete Scheduling Workflow', () => {
		it('creates a full schedule from setup to assignments', async () => {
			// Step 1: Create students
			const student1 = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const student2 = await createStudent(db, {
				name: 'Bob Smith',
				email: 'bob@example.com',
				cohort: '2024'
			});

			expect(student1.id).toBeDefined();
			expect(student2.id).toBeDefined();

			// Step 2: Create preceptors
			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. Sarah Williams',
				email: 'sarah@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. John Davis',
				email: 'john@hospital.com',
				specialty: 'Neurology',
				max_students: 1
			});

			expect(preceptor1.id).toBeDefined();
			expect(preceptor2.id).toBeDefined();

			// Step 3: Create clerkships
			const clerkship1 = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 5
			});

			const clerkship2 = await createClerkship(db, {
				name: 'Neurology Rotation',
				specialty: 'Neurology',
				required_days: 3
			});

			expect(clerkship1.id).toBeDefined();
			expect(clerkship2.id).toBeDefined();

			// Step 4: Set preceptor availability
			await setAvailability(db, preceptor1.id, '2024-01-15', true);
			await setAvailability(db, preceptor1.id, '2024-01-16', true);
			await setAvailability(db, preceptor1.id, '2024-01-17', true);
			await setAvailability(db, preceptor2.id, '2024-01-18', true);
			await setAvailability(db, preceptor2.id, '2024-01-19', true);

			// Step 5: Add blackout date
			const blackout = await createBlackoutDate(db, {
				date: '2024-01-20',
				reason: 'Holiday'
			});

			expect(blackout.id).toBeDefined();

			// Step 6: Create assignments
			const assignment1 = await createAssignment(db, {
				student_id: student1.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship1.id,
				date: '2024-01-15'
			});

			const assignment2 = await createAssignment(db, {
				student_id: student2.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship1.id,
				date: '2024-01-15'
			});

			const assignment3 = await createAssignment(db, {
				student_id: student1.id,
				preceptor_id: preceptor2.id,
				clerkship_id: clerkship2.id,
				date: '2024-01-18'
			});

			// Verify assignments created
			expect(assignment1.id).toBeDefined();
			expect(assignment2.id).toBeDefined();
			expect(assignment3.id).toBeDefined();

			// Step 7: Verify student's complete schedule
			const student1Assignments = await getAssignmentsByStudent(db, student1.id);
			expect(student1Assignments).toHaveLength(2);
			expect(student1Assignments[0].date).toBe('2024-01-15');
			expect(student1Assignments[1].date).toBe('2024-01-18');

			// Step 8: Check student progress
			const progress = await getStudentProgress(db, student1.id);
			expect(progress).toHaveLength(2);

			const cardiologyProgress = progress.find((p) => p.clerkship_id === clerkship1.id);
			expect(cardiologyProgress?.completed_days).toBe(1);
			expect(cardiologyProgress?.required_days).toBe(5);
			expect(cardiologyProgress?.percentage).toBe(20);

			const neurologyProgress = progress.find((p) => p.clerkship_id === clerkship2.id);
			expect(neurologyProgress?.completed_days).toBe(1);
			expect(neurologyProgress?.required_days).toBe(3);
			expect(neurologyProgress?.percentage).toBe(33);
		});

		it('enforces business rules across the workflow', async () => {
			// Create entities
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const cardiologyPreceptor = await createPreceptor(db, {
				name: 'Dr. Cardio',
				email: 'cardio@hospital.com',
				specialty: 'Cardiology',
				max_students: 1
			});

			const neurologyClerkship = await createClerkship(db, {
				name: 'Neurology',
				specialty: 'Neurology',
				required_days: 5
			});

			// Attempt to create assignment with specialty mismatch
			await expect(
				createAssignment(db, {
					student_id: student.id,
					preceptor_id: cardiologyPreceptor.id,
					clerkship_id: neurologyClerkship.id,
					date: '2024-01-15'
				})
			).rejects.toThrow(/specialty/);
		});

		it('respects blackout dates in assignment creation', async () => {
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				specialty: 'Cardiology',
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 5
			});

			// Add blackout date
			await createBlackoutDate(db, {
				date: '2024-01-15',
				reason: 'Holiday'
			});

			// Attempt to create assignment on blackout date
			await expect(
				createAssignment(db, {
					student_id: student.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: '2024-01-15'
				})
			).rejects.toThrow(/blackout date/);
		});

		it('enforces preceptor availability constraints', async () => {
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				specialty: 'Cardiology',
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 5
			});

			// Mark preceptor as unavailable
			await setAvailability(db, preceptor.id, '2024-01-15', false);

			// Attempt to create assignment when unavailable
			await expect(
				createAssignment(db, {
					student_id: student.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: '2024-01-15'
				})
			).rejects.toThrow(/not available/);
		});

		it('enforces preceptor capacity limits', async () => {
			const student1 = await createStudent(db, {
				name: 'Student 1',
				email: 'student1@example.com',
				cohort: '2024'
			});

			const student2 = await createStudent(db, {
				name: 'Student 2',
				email: 'student2@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				specialty: 'Cardiology',
				max_students: 1 // Only 1 student allowed
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 5
			});

			// First assignment succeeds
			await createAssignment(db, {
				student_id: student1.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			// Second assignment on same date should fail
			await expect(
				createAssignment(db, {
					student_id: student2.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: '2024-01-15'
				})
			).rejects.toThrow(/capacity/);
		});

		it('prevents student double-booking', async () => {
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. One',
				email: 'one@hospital.com',
				specialty: 'Cardiology',
				max_students: 1
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. Two',
				email: 'two@hospital.com',
				specialty: 'Neurology',
				max_students: 1
			});

			const clerkship1 = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 5
			});

			const clerkship2 = await createClerkship(db, {
				name: 'Neurology',
				specialty: 'Neurology',
				required_days: 5
			});

			// First assignment succeeds
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship1.id,
				date: '2024-01-15'
			});

			// Second assignment on same date should fail
			await expect(
				createAssignment(db, {
					student_id: student.id,
					preceptor_id: preceptor2.id,
					clerkship_id: clerkship2.id,
					date: '2024-01-15'
				})
			).rejects.toThrow(/already has an assignment/);
		});
	});

	describe('Multi-Student Scheduling Scenarios', () => {
		it('schedules multiple students across different clerkships', async () => {
			// Create 3 students
			const students = await Promise.all([
				createStudent(db, { name: 'Alice', email: 'alice@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Bob', email: 'bob@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Charlie', email: 'charlie@example.com', cohort: '2024' })
			]);

			// Create 2 preceptors with capacity for 2 students each
			const preceptors = await Promise.all([
				createPreceptor(db, {
					name: 'Dr. A',
					email: 'a@hospital.com',
					specialty: 'Cardiology',
					max_students: 2
				}),
				createPreceptor(db, {
					name: 'Dr. B',
					email: 'b@hospital.com',
					specialty: 'Neurology',
					max_students: 2
				})
			]);

			// Create 2 clerkships
			const clerkships = await Promise.all([
				createClerkship(db, { name: 'Cardiology', specialty: 'Cardiology', required_days: 10 }),
				createClerkship(db, { name: 'Neurology', specialty: 'Neurology', required_days: 10 })
			]);

			// Assign students to different rotations
			await createAssignment(db, {
				student_id: students[0].id,
				preceptor_id: preceptors[0].id,
				clerkship_id: clerkships[0].id,
				date: '2024-01-15'
			});

			await createAssignment(db, {
				student_id: students[1].id,
				preceptor_id: preceptors[0].id,
				clerkship_id: clerkships[0].id,
				date: '2024-01-15'
			});

			await createAssignment(db, {
				student_id: students[2].id,
				preceptor_id: preceptors[1].id,
				clerkship_id: clerkships[1].id,
				date: '2024-01-15'
			});

			// Verify all assignments created
			for (const student of students) {
				const assignments = await getAssignmentsByStudent(db, student.id);
				expect(assignments.length).toBeGreaterThan(0);
			}
		});

		it('tracks progress for multiple students simultaneously', async () => {
			const student1 = await createStudent(db, {
				name: 'Student 1',
				email: 's1@example.com',
				cohort: '2024'
			});

			const student2 = await createStudent(db, {
				name: 'Student 2',
				email: 's2@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			// Student 1 completes 5 days
			for (let i = 0; i < 5; i++) {
				await createAssignment(db, {
					student_id: student1.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: `2024-01-${15 + i}`
				});
			}

			// Student 2 completes 3 days
			for (let i = 0; i < 3; i++) {
				await createAssignment(db, {
					student_id: student2.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: `2024-01-${20 + i}`
				});
			}

			const progress1 = await getStudentProgress(db, student1.id);
			const progress2 = await getStudentProgress(db, student2.id);

			expect(progress1[0].completed_days).toBe(5);
			expect(progress1[0].percentage).toBe(50);

			expect(progress2[0].completed_days).toBe(3);
			expect(progress2[0].percentage).toBe(30);
		});
	});

	describe('Validation Integration', () => {
		it('validates assignment with all constraints', async () => {
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			// Mark preceptor as available
			await setAvailability(db, preceptor.id, '2024-01-15', true);

			const assignmentData = {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			};

			const validation = await validateAssignment(db, assignmentData);

			expect(validation.valid).toBe(true);
			expect(validation.errors).toEqual([]);
		});

		it('returns all validation errors for invalid assignment', async () => {
			const assignmentData = {
				student_id: 'non-existent-student',
				preceptor_id: 'non-existent-preceptor',
				clerkship_id: 'non-existent-clerkship',
				date: '2024-01-15'
			};

			const validation = await validateAssignment(db, assignmentData);

			expect(validation.valid).toBe(false);
			expect(validation.errors.length).toBeGreaterThan(0);
			expect(validation.errors).toContain('Student not found');
			expect(validation.errors).toContain('Preceptor not found');
			expect(validation.errors).toContain('Clerkship not found');
		});
	});
});
