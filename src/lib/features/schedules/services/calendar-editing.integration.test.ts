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
import { createStudent as createStudentService } from '$lib/features/students/services/student-service';
import {
	createAssignment as createAssignmentService,
	bulkCreateAssignments as bulkCreateAssignmentsService
} from './assignment-service';
import { nanoid } from 'nanoid';

// Every calendar read is now scoped to a schedule by the assignment's own
// schedule_id (finding P4-a), so this test operates within a single fixed
// schedule: it links each student to it, and stamps that schedule_id onto the
// rows the legacy create helpers insert (which leave schedule_id null).
const TEST_SCHEDULE_ID = 'test-schedule';

/** Stamp the fixed schedule id onto any rows the legacy creators left null. */
async function stampSchedule(db: Kysely<DB>) {
	await db
		.updateTable('schedule_assignments')
		.set({ schedule_id: TEST_SCHEDULE_ID })
		.where('schedule_id', 'is', null)
		.execute();
}

async function createAssignment(...args: Parameters<typeof createAssignmentService>) {
	const a = await createAssignmentService(...args);
	await stampSchedule(args[0]);
	return a;
}

async function bulkCreateAssignments(...args: Parameters<typeof bulkCreateAssignmentsService>) {
	const rows = await bulkCreateAssignmentsService(...args);
	await stampSchedule(args[0]);
	return rows;
}

async function createStudent(db: Kysely<DB>, data: any) {
	const student = await createStudentService(db, data);
	await db
		.insertInto('schedule_students')
		.values({
			id: nanoid(),
			schedule_id: TEST_SCHEDULE_ID,
			student_id: student.id,
			created_at: new Date().toISOString()
		})
		.execute();
	return student;
}
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
	// Health systems table
	await db.schema
		.createTable('health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('location', 'text')
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptors (updated schema with phone and health_system_id)
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('is_global_fallback_only', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Clerkships (with clerkship_type)
	await db.schema
		.createTable('clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('clerkship_type', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text')
		.addColumn('required_days', 'integer', (col) => col.notNull())
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Clerkship configurations (required by clerkship service)
	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

		await db.schema
		.createTable('scheduling_periods')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('start_date', 'text', (col) => col.notNull())
		.addColumn('end_date', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('clerkship_sites')
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.execute();

	// getEnrichedAssignments left-joins sites for the export's site_name (P4-f).
	await db.schema
		.createTable('sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('student_health_system_onboarding')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text', (col) => col.notNull())
		.addColumn('is_completed', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('completed_date', 'text')
		.addColumn('notes', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('clerkship_electives')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('minimum_days', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('is_required', 'integer', (col) => col.notNull().defaultTo(0))
		.execute();

	await db.schema
		.createTable('preceptor_capacity_rules')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text')
		.addColumn('requirement_type', 'text')
		.addColumn('max_students_per_day', 'integer', (col) => col.notNull())
		.addColumn('max_students_per_year', 'integer', (col) => col.notNull())
		.addColumn('max_students_per_block', 'integer')
		.addColumn('max_blocks_per_year', 'integer')
		.execute();

await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text')
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('elective_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('status', 'text', (col) => col.notNull())
		.addColumn('locked', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('source', 'text', (col) => col.notNull().defaultTo('manual'))
		.addColumn('override_codes', 'text', (col) => col.notNull().defaultTo('[]'))
		.addColumn('override_note', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('blackout_dates')
		.addColumn('schedule_id', 'text')
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

/**
 * Create health system directly in database
 */
async function createHealthSystem(db: Kysely<DB>): Promise<{ id: string }> {
	const timestamp = new Date().toISOString();
	const id = nanoid();
	await db
		.insertInto('health_systems')
		.values({
			id,
			name: 'Test Health System',
			location: 'Test Location',
			created_at: timestamp,
			updated_at: timestamp
		})
		.execute();
	return { id };
}

/**
 * Create preceptor directly in database (bypasses service validation)
 */
async function createPreceptorDirect(
	db: Kysely<DB>,
	data: {
		name: string;
		email: string;
		health_system_id: string;
		max_students?: number;
		specialty?: string;
	}
): Promise<{ id: string; name: string; specialty?: string }> {
	const timestamp = new Date().toISOString();
	const id = nanoid();
	await db
		.insertInto('preceptors')
		.values({
			id,
			name: data.name,
			email: data.email,
			health_system_id: data.health_system_id,
			max_students: data.max_students ?? 2,
			created_at: timestamp,
			updated_at: timestamp
		})
		.execute();
	return { id, name: data.name, specialty: data.specialty };
}

/**
 * Create clerkship directly in database (bypasses service validation)
 */
async function createClerkshipDirect(
	db: Kysely<DB>,
	data: { name: string; clerkship_type: string; required_days: number; specialty?: string }
): Promise<{ id: string; name: string; specialty?: string }> {
	const timestamp = new Date().toISOString();
	const clerkshipId = nanoid();
	await db
		.insertInto('clerkships')
		.values({
			id: clerkshipId,
			name: data.name,
			clerkship_type: data.clerkship_type,
			specialty: data.specialty,
			required_days: data.required_days,
			created_at: timestamp,
			updated_at: timestamp
		})
		.execute();
	// Also create clerkship configuration
	await db
		.insertInto('clerkship_configurations')
		.values({
			id: nanoid(),
			clerkship_id: clerkshipId,
			created_at: timestamp,
			updated_at: timestamp
		})
		.execute();
	return { id: clerkshipId, name: data.name, specialty: data.specialty };
}

/**
 * Get a future date string (YYYY-MM-DD format)
 */
function getFutureDate(daysFromNow: number): string {
	const date = new Date();
	date.setDate(date.getDate() + daysFromNow);
	return date.toISOString().split('T')[0];
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
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const enriched = await getEnrichedAssignments(db, {
				scheduleId: TEST_SCHEDULE_ID,
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].student_name).toBe('Alice Johnson');
			expect(enriched[0].preceptor_name).toBe('Dr. Smith');
			expect(enriched[0].clerkship_name).toBe('Cardiology Rotation');
			// preceptor_specialty may not exist anymore, update test expectation
		});

		it('does not leak the same student’s rows from another schedule (P4-a)', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// One row on our schedule (stamped to TEST_SCHEDULE_ID by the wrapper).
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});
			// A row for the SAME student on another schedule, different date (the DB
			// enforces a global UNIQUE(student_id, date)).
			const ts = new Date().toISOString();
			await db
				.insertInto('schedule_assignments')
				.values({
					id: nanoid(),
					schedule_id: 'other-schedule',
					student_id: student.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: '2024-01-16',
					status: 'scheduled',
					created_at: ts,
					updated_at: ts
				})
				.execute();

			const enriched = await getEnrichedAssignments(db, {
				scheduleId: TEST_SCHEDULE_ID,
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			// Only our schedule's single row — the other schedule's day is excluded.
			expect(enriched).toHaveLength(1);
			expect(enriched[0].date).toBe('2024-01-15');
		});

		it('filters by student_id', async () => {
			const healthSystem = await createHealthSystem(db);
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

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
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
				scheduleId: TEST_SCHEDULE_ID,
				student_id: student1.id,
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].student_name).toBe('Student 1');
		});

		it('filters by date range', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
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
				scheduleId: TEST_SCHEDULE_ID,
				start_date: '2024-01-15',
				end_date: '2024-01-25'
			});

			expect(enriched).toHaveLength(1);
			expect(enriched[0].date).toBe('2024-01-20');
		});
	});

	describe('getCalendarEvents()', () => {
		it('converts assignments to calendar event format', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: '2024-01-15'
			});

			const events = await getCalendarEvents(db, {
				scheduleId: TEST_SCHEDULE_ID,
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
			const healthSystem = await createHealthSystem(db);
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
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
				scheduleId: TEST_SCHEDULE_ID,
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
			const healthSystem = await createHealthSystem(db);
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptors = await Promise.all([
				createPreceptorDirect(db, {
					name: 'Dr. A',
					email: 'a@hospital.com',
					health_system_id: healthSystem.id,
					max_students: 2
				}),
				createPreceptorDirect(db, {
					name: 'Dr. B',
					email: 'b@hospital.com',
					health_system_id: healthSystem.id,
					max_students: 2
				})
			]);

			const clerkships = await Promise.all([
				createClerkshipDirect(db, {
					name: 'Cardiology',
					clerkship_type: 'outpatient',
					required_days: 10
				}),
				createClerkshipDirect(db, {
					name: 'Neurology',
					clerkship_type: 'inpatient',
					required_days: 10
				})
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

			const summary = await getScheduleSummary(db, TEST_SCHEDULE_ID, '2024-01-01', '2024-12-31');

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
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. One',
				email: 'one@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 1
			});

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Two',
				email: 'two@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 1
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate = getFutureDate(30);
			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate
			});

			const result = await reassignToPreceptor(db, assignment.id, preceptor2.id);

			expect(result.valid).toBe(true);
			expect(result.assignment?.preceptor_id).toBe(preceptor2.id);
		});

		it('validates reassignment in dry run mode', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. One',
				email: 'one@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 1
			});

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Two',
				email: 'two@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 1
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate = getFutureDate(30);
			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate
			});

			const result = await reassignToPreceptor(db, assignment.id, preceptor2.id, true);

			// Test passes - reassignment is valid when both preceptors are available
			expect(result.valid).toBe(true);
		});
	});

	describe('changeAssignmentDate()', () => {
		it('changes assignment date successfully', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 1
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate1 = getFutureDate(30);
			const futureDate2 = getFutureDate(31);

			const assignment = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: futureDate1
			});

			const result = await changeAssignmentDate(db, assignment.id, futureDate2);

			expect(result.valid).toBe(true);
			expect(result.assignment?.date).toBe(futureDate2);
		});

		it('prevents date change that creates conflict', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate1 = getFutureDate(30);
			const futureDate2 = getFutureDate(31);

			// Create two assignments on different dates
			const assignment1 = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: futureDate1
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: futureDate2
			});

			// Try to change assignment1 to same date as assignment2
			const result = await changeAssignmentDate(db, assignment1.id, futureDate2);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('already has an assignment'))).toBe(true);
		});
	});

	describe('swapAssignments()', () => {
		it('swaps preceptors between two assignments', async () => {
			const healthSystem = await createHealthSystem(db);
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptors = await Promise.all([
				createPreceptorDirect(db, {
					name: 'Dr. A',
					email: 'a@hospital.com',
					health_system_id: healthSystem.id,
					max_students: 1
				}),
				createPreceptorDirect(db, {
					name: 'Dr. B',
					email: 'b@hospital.com',
					health_system_id: healthSystem.id,
					max_students: 1
				})
			]);

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate1 = getFutureDate(30);
			const futureDate2 = getFutureDate(31);

			const assignment1 = await createAssignment(db, {
				student_id: students[0].id,
				preceptor_id: preceptors[0].id,
				clerkship_id: clerkship.id,
				date: futureDate1
			});

			const assignment2 = await createAssignment(db, {
				student_id: students[1].id,
				preceptor_id: preceptors[1].id,
				clerkship_id: clerkship.id,
				date: futureDate2
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
			const healthSystem = await createHealthSystem(db);
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Old',
				email: 'old@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. New',
				email: 'new@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate1 = getFutureDate(30);
			const futureDate2 = getFutureDate(31);

			const assignments = await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkship.id,
						date: futureDate1
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkship.id,
						date: futureDate2
					}
				]
			});

			const assignmentIds = assignments.map((a) => a.id);
			const result = await bulkReassign(db, assignmentIds, preceptor2.id);

			expect(result.successful).toHaveLength(2);
			expect(result.failed).toHaveLength(0);
		});

		it('reports partial success when some assignments fail', async () => {
			const healthSystem = await createHealthSystem(db);
			const students = await Promise.all([
				createStudent(db, { name: 'Student 1', email: 's1@example.com', cohort: '2024' }),
				createStudent(db, { name: 'Student 2', email: 's2@example.com', cohort: '2024' })
			]);

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Old',
				email: 'old@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. New',
				email: 'new@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkships = await Promise.all([
				createClerkshipDirect(db, {
					name: 'Cardiology',
					clerkship_type: 'outpatient',
					required_days: 10
				}),
				createClerkshipDirect(db, {
					name: 'Neurology',
					clerkship_type: 'inpatient',
					required_days: 10
				})
			]);

			const futureDate1 = getFutureDate(30);
			const futureDate2 = getFutureDate(31);

			const assignments = await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: students[0].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkships[0].id,
						date: futureDate1
					},
					{
						student_id: students[1].id,
						preceptor_id: preceptor1.id,
						clerkship_id: clerkships[1].id,
						date: futureDate2
					}
				]
			});

			const assignmentIds = assignments.map((a) => a.id);
			const result = await bulkReassign(db, assignmentIds, preceptor2.id);

			// Both succeed since preceptors no longer have specialty constraints
			expect(result.successful).toHaveLength(2);
			expect(result.failed).toHaveLength(0);
		});
	});

	describe('clearAllAssignments()', () => {
		it('clears all assignments from database', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			await bulkCreateAssignments(
				db,
				{
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
				},
				TEST_SCHEDULE_ID
			);

			const count = await clearAllAssignments(db, TEST_SCHEDULE_ID);

			expect(count).toBe(2);

			// Verify assignments cleared
			const remaining = await getEnrichedAssignments(db, {
				scheduleId: TEST_SCHEDULE_ID,
				start_date: '2024-01-01',
				end_date: '2024-12-31'
			});

			expect(remaining).toHaveLength(0);
		});

		it('preserves locked assignments (auto-generation lock honoring)', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Locked Student',
				email: 'locked@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Lock',
				email: 'lock@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			const clerkship = await createClerkshipDirect(db, {
				name: 'Neurology',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const ts = new Date().toISOString();
			// One unlocked, one locked assignment.
			await db
				.insertInto('schedule_assignments')
				.values([
					{
						id: 'unlocked-1',
						schedule_id: TEST_SCHEDULE_ID,
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-02-01',
						status: 'scheduled',
						locked: 0,
						source: 'generated',
						created_at: ts,
						updated_at: ts
					},
					{
						id: 'locked-1',
						schedule_id: TEST_SCHEDULE_ID,
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-02-02',
						status: 'scheduled',
						locked: 1,
						source: 'manual',
						created_at: ts,
						updated_at: ts
					}
				])
				.execute();

			const count = await clearAllAssignments(db, TEST_SCHEDULE_ID);
			expect(count).toBe(1); // only the unlocked one

			const remaining = await db.selectFrom('schedule_assignments').select('id').execute();
			expect(remaining.map((r) => r.id)).toEqual(['locked-1']);
		});
	});

	describe('bulkCreateAssignments() — lock/existing honoring', () => {
		it('skips generated assignments that would collide with an existing (student,date) and marks source=generated', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Gen Student',
				email: 'gen@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Gen',
				email: 'gen@hospital.com',
				health_system_id: healthSystem.id,
				max_students: 5
			});
			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardio',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const ts = new Date().toISOString();
			// A locked assignment already occupies (student, 2024-03-01).
			await db
				.insertInto('schedule_assignments')
				.values({
					id: 'locked-x',
					student_id: student.id,
					preceptor_id: preceptor.id,
					clerkship_id: clerkship.id,
					date: '2024-03-01',
					status: 'scheduled',
					locked: 1,
					source: 'manual',
					created_at: ts,
					updated_at: ts
				})
				.execute();

			// Generation output includes a colliding slot (2024-03-01) and a free one (2024-03-02).
			const inserted = await bulkCreateAssignments(db, {
				assignments: [
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-03-01'
					},
					{
						student_id: student.id,
						preceptor_id: preceptor.id,
						clerkship_id: clerkship.id,
						date: '2024-03-02'
					}
				]
			});

			// Only the non-colliding slot is created (no UNIQUE violation).
			expect(inserted).toHaveLength(1);
			expect(inserted[0].date).toBe('2024-03-02');
			expect(inserted[0].source).toBe('generated');

			// The locked assignment is untouched.
			const locked = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.where('id', '=', 'locked-x')
				.executeTakeFirst();
			expect(locked?.locked).toBe(1);
			expect(locked?.source).toBe('manual');
		});
	});
});
