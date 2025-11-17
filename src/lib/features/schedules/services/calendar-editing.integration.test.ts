// @ts-nocheck
/**
 * Calendar and Editing Integration Tests
 *
 * Tests calendar aggregation and schedule editing operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';

// Import services
import { createStudent } from '$lib/features/students/services/student-service';
import { createPreceptor } from '$lib/features/preceptors/services/preceptor-service';
import { createClerkship } from '$lib/features/clerkships/services/clerkship-service';
import { createAssignment, bulkCreateAssignments } from './assignment-service';
import {
	getEnrichedAssignments,
	getCalendarEvents,
	getDailyAssignments,
	getAssignmentsByStudent as getEnrichedByStudent,
	getAssignmentsByPreceptor as getEnrichedByPreceptor,
	getScheduleSummary
} from './calendar-service';
import {
	reassignToPreceptor,
	changeAssignmentDate,
	swapAssignments,
	validateEdit,
	bulkReassign,
	clearAllAssignments
} from './editing-service';

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
 * Initialize complete database schema
 */
async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

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
		.addColumn('status', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

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

describe('Calendar Service Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getEnrichedAssignments()', () => {
		it('retrieves assignments with all related entity data', async () => {
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 10
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const enriched = await getEnrichedAssignments(db, {
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].student_name).toBe('Alice Johnson');
			expect(enriched[0].preceptor_name).toBe('Dr. Smith');
			expect(enriched[0].clerkship_name).toBe('Cardiology Rotation');
			expect(enriched[0].preceptor_specialty).toBe('Cardiology');
		});

		it('filters by student_id', async () => {
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

			await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: student1.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					},
					{
						student_id: student2.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					}
				]
			});

			const enriched = await getEnrichedAssignments(db, {
				student_id: student1.id,
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].student_name).toBe('Student 1');
		});

		it('filters by date range', async () => {
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

			await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-10'
					},
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-20'
					},
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-30'
					}
				]
			});

			const enriched = await getEnrichedAssignments(db, {
				start_date: '2024-01-15',
				end_date: '2024-01-25'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].date).toBe('2024-01-20');
		});
	});

	describe('getCalendarEvents()', () => {
		it('converts assignments to calendar event format', async () => {
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 10
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const events = await getCalendarEvents(db, {
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(events).toHaveLength(1);
			expect(events[0].title).toContain('Alice Johnson');
			expect(events[0].title).toContain('Cardiology Rotation');
			expect(events[0].description).toContain('Dr. Smith');
			expect(events[0].date).toBe('2024-01-15');
			expect(events[0].color).toBeDefined();
		});
	});

	describe('getDailyAssignments()', () => {
		it('groups assignments by date', async () => {
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

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

			// Create 2 assignments on same day, 1 on different day
			await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					},
					{
						student_id: students[0].id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-16'
					}
				]
			});

			const daily = await getDailyAssignments(db, {
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(daily).toHaveLength(2);
			expect(daily[0].date).toBe('2024-01-15');
			expect(daily[0].count).toBe(2);
			expect(daily[1].date).toBe('2024-01-16');
			expect(daily[1].count).toBe(1);
		});
	});

	describe('getScheduleSummary()', () => {
		it('calculates summary statistics', async () => {
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

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

			const clerkships = await Promise.all([
				createClerkship(db, { name: 'Cardiology', specialty: 'Cardiology', required_days: 10 }),
				createClerkship(db, { name: 'Neurology', specialty: 'Neurology', required_days: 10 })
			]);

			await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptors[0].id,
						clerkship_id: clerkships[0].id,
						date: '2024-01-15'
					},
					{
						student_id: students[0].id,
						preceptor_id: preceptors[0].id,
						clerkship_id: clerkships[0].id,
						date: '2024-01-16'
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptors[1].id,
						clerkship_id: clerkships[1].id,
						date: '2024-01-15'
					}
				]
			});

			const summary = await getScheduleSummary(db, '2024-01-01', '2024-12-31');

			expect(summary.total_assignments).toBe(3);
			expect(summary.active_students).toBe(2);
			expect(summary.active_preceptors).toBe(2);
			expect(summary.assignments_by_clerkship).toHaveLength(2);
			expect(summary.assignments_by_clerkship[0].count).toBe(2); // Sorted by count descending
		});
	});
});

describe('Editing Service Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('reassignToPreceptor()', () => {
		it('reassigns student to different preceptor', async () => {
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
				specialty: 'Cardiology',
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const result = await reassignToPreceptor(db, assignment.id, preceptor2.id);

			expect(result.valid).toBe(true);
			expect(result.assignment?.preceptor_id).toBe(preceptor2.id);
		});

		it('validates reassignment in dry run mode', async () => {
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
				specialty: 'Neurology', // Different specialty
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const result = await reassignToPreceptor(db, assignment.id, preceptor2.id, true);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('specialty'))).toBe(true);
		});
	});

	describe('changeAssignmentDate()', () => {
		it('changes assignment date successfully', async () => {
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
				required_days: 10
			});

			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const result = await changeAssignmentDate(db, assignment.id, '2024-01-16');

			expect(result.valid).toBe(true);
			expect(result.assignment?.date).toBe('2024-01-16');
		});

		it('prevents date change that creates conflict', async () => {
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

			// Create two assignments on different dates
			const assignment1 = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-16'
			});

			// Try to change assignment1 to same date as assignment2
			const result = await changeAssignmentDate(db, assignment1.id, '2024-01-16');

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('already has an assignment'))).toBe(true);
		});
	});

	describe('swapAssignments()', () => {
		it('swaps preceptors between two assignments', async () => {
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptors = await Promise.all([
				createPreceptor(db, {
					name: 'Dr. A',
					email: 'a@hospital.com',
					specialty: 'Cardiology',
					max_students: 1
				}),
				createPreceptor(db, {
					name: 'Dr. B',
					email: 'b@hospital.com',
					specialty: 'Cardiology',
					max_students: 1
				})
			]);

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			const assignment1 = await createAssignment(db, {
				student_id: students[0].id,
				preceptor_id: preceptors[0].id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const assignment2 = await createAssignment(db, {
				student_id: students[1].id,
				preceptor_id: preceptors[1].id,
				clerkship_id: clerkship.id,
				date: '2024-01-16'
			});

			const result = await swapAssignments(db, assignment1.id, assignment2.id);

			expect(result.valid).toBe(true);
			expect(result.assignments).toHaveLength(2);
			expect(result.assignments![0].preceptor_id).toBe(preceptors[1].id);
			expect(result.assignments![1].preceptor_id).toBe(preceptors[0].id);
		});
	});

	describe('bulkReassign()', () => {
		it('reassigns multiple assignments to new preceptor', async () => {
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. Old',
				email: 'old@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. New',
				email: 'new@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				specialty: 'Cardiology',
				required_days: 10
			});

			const assignments = await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkship.id,
						date: '2024-01-16'
					}
				]
			});

			const assignmentIds = assignments.map((a) => a.id);
			const result = await bulkReassign(db, assignmentIds, preceptor2.id);

			expect(result.successful).toHaveLength(2);
			expect(result.failed).toHaveLength(0);
		});

		it('reports partial success when some assignments fail', async () => {
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. Old',
				email: 'old@hospital.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. New',
				email: 'new@hospital.com',
				specialty: 'Neurology', // Different specialty for second clerkship
				max_students: 2
			});

			const clerkships = await Promise.all([
				createClerkship(db, { name: 'Cardiology', specialty: 'Cardiology', required_days: 10 }),
				createClerkship(db, { name: 'Neurology', specialty: 'Neurology', required_days: 10 })
			]);

			const assignments = await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkships[0].id, // Cardiology - will fail
						date: '2024-01-15'
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkships[1].id, // Neurology - will succeed
						date: '2024-01-16'
					}
				]
			});

			const assignmentIds = assignments.map((a) => a.id);
			const result = await bulkReassign(db, assignmentIds, preceptor2.id);

			expect(result.successful).toHaveLength(1);
			expect(result.failed).toHaveLength(1);
		});
	});

	describe('clearAllAssignments()', () => {
		it('clears all assignments from database', async () => {
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

			await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-15'
					},
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-01-16'
					}
				]
			});

			const count = await clearAllAssignments(db);

			expect(count).toBe(2);

			// Verify assignments cleared
			const remaining = await getEnrichedAssignments(db, {
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(remaining).toHaveLength(0);
		});
	});
});
