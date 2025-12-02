// @ts-nocheck
/**
 * Schedules API Integration Tests
 *
 * Comprehensive integration tests for scheduling API endpoints.
 * Tests the complete flow from API request handling through service layer to database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';

// Import services used by API routes
import { createStudent } from '$lib/features/students/services/student-service';
import { createClerkship } from '$lib/features/clerkships/services/clerkship-service';
import {
	createAssignment,
	getAssignmentById,
	updateAssignment,
	deleteAssignment,
	bulkCreateAssignments
} from './assignment-service';
import {
	getStudentScheduleData,
	getPreceptorScheduleData,
	getScheduleSummaryData
} from './schedule-views-service';
import {
	reassignToPreceptor,
	swapAssignments,
	clearAllAssignments
} from './editing-service';
import { setAvailability } from '$lib/features/preceptors/services/availability-service';

// Mock the scheduling period service for schedule-views tests
vi.mock('$lib/features/scheduling/services/scheduling-period-service', () => ({
	getActiveSchedulingPeriod: vi.fn()
}));

import { getActiveSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';

/**
 * Generate a CUID2-like test ID (20-30 characters)
 */
let testIdCounter = 0;
function generateTestId(prefix: string = 'cl'): string {
	testIdCounter++;
	return `${prefix}${testIdCounter.toString().padStart(18, '0')}`;
}

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
 * Generate a future date string (1 month from now)
 * Used for tests that need to modify assignments (past dates are locked)
 */
function getFutureDate(daysOffset: number = 30): string {
	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + daysOffset);
	return futureDate.toISOString().split('T')[0];
}

/**
 * Initialize complete database schema for integration tests
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

	// Preceptors table (no specialty field)
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Sites table
	await db.schema
		.createTable('sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text')
		.addColumn('address', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptor sites table
	await db.schema
		.createTable('preceptor_sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Clerkships table
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

	// Clerkship Configurations table
	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) => col.notNull().unique())
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
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

/**
 * Helper to create a health system
 */
async function createHealthSystem(db: Kysely<DB>, name: string = 'Test Health System') {
	const timestamp = new Date().toISOString();
	const healthSystem = await db
		.insertInto('health_systems')
		.values({
			id: generateTestId('clhs'),
			name,
			location: 'Test Location',
			description: null,
			created_at: timestamp,
			updated_at: timestamp
		})
		.returningAll()
		.executeTakeFirstOrThrow();
	return healthSystem;
}

/**
 * Helper to create a site
 */
async function createSiteDirect(db: Kysely<DB>, healthSystemId: string) {
	const timestamp = new Date().toISOString();
	const site = await db
		.insertInto('sites')
		.values({
			id: generateTestId('clsite'),
			name: 'Test Site',
			health_system_id: healthSystemId,
			created_at: timestamp,
			updated_at: timestamp
		})
		.returningAll()
		.executeTakeFirstOrThrow();
	return site;
}

/**
 * Helper to link preceptor to site
 */
async function linkPreceptorToSite(db: Kysely<DB>, preceptorId: string, siteId: string) {
	const timestamp = new Date().toISOString();
	await db
		.insertInto('preceptor_sites')
		.values({
			id: generateTestId('clps'),
			preceptor_id: preceptorId,
			site_id: siteId,
			created_at: timestamp,
			updated_at: timestamp
		})
		.execute();
}

/**
 * Helper to create a preceptor directly in the database
 */
async function createPreceptorDirect(
	db: Kysely<DB>,
	data: { name: string; email: string; health_system_id?: string; max_students?: number }
) {
	const timestamp = new Date().toISOString();
	const preceptor = await db
		.insertInto('preceptors')
		.values({
			id: generateTestId('clprec'),
			name: data.name,
			email: data.email,
			phone: null,
			health_system_id: data.health_system_id || null,
			site_id: null,
			max_students: data.max_students || 2,
			created_at: timestamp,
			updated_at: timestamp
		})
		.returningAll()
		.executeTakeFirstOrThrow();
	return preceptor;
}

describe('Schedules API Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		testIdCounter = 0;
		db = createTestDb();
		await initializeSchema(db);

		// Mock active period
		vi.mocked(getActiveSchedulingPeriod).mockResolvedValue({
			id: generateTestId('clperiod'),
			name: 'Test Period',
			start_date: '2024-01-01',
			end_date: '2024-12-31',
			is_active: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});
	});

	afterEach(async () => {
		await db.destroy();
		vi.clearAllMocks();
	});

	// =========================================================================
	// Assignment CRUD - /api/schedules/assignments/[id]
	// =========================================================================

	describe('Assignment CRUD - GET /api/schedules/assignments/[id]', () => {
		it('returns assignment when found', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const created = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15'
			});

			const fetched = await getAssignmentById(db, created.id as string);

			expect(fetched).not.toBeNull();
			expect(fetched!.id).toBe(created.id);
			expect(fetched!.student_id).toBe(student.id);
			expect(fetched!.preceptor_id).toBe(preceptor.id);
			expect(fetched!.date).toBe('2024-06-15');
		});

		it('returns null for non-existent assignment', async () => {
			const fetched = await getAssignmentById(db, 'nonexistent00000001');
			expect(fetched).toBeNull();
		});
	});

	describe('Assignment CRUD - PATCH /api/schedules/assignments/[id]', () => {
		it('updates assignment date', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate = getFutureDate(30);
			const newFutureDate = getFutureDate(35);

			const created = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: futureDate
			});

			const updated = await updateAssignment(db, created.id as string, {
				date: newFutureDate
			});

			expect(updated.date).toBe(newFutureDate);
		});

		it('updates assignment status', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate = getFutureDate(30);

			const created = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: futureDate
			});

			const updated = await updateAssignment(db, created.id as string, {
				status: 'confirmed'
			});

			expect(updated.status).toBe('confirmed');
		});

		it('throws NotFoundError for non-existent assignment', async () => {
			await expect(
				updateAssignment(db, 'nonexistent00000001', { date: '2024-06-20' })
			).rejects.toThrow();
		});
	});

	describe('Assignment CRUD - DELETE /api/schedules/assignments/[id]', () => {
		it('deletes assignment successfully', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const futureDate = getFutureDate(30);

			const created = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: futureDate
			});

			await deleteAssignment(db, created.id as string);

			const fetched = await getAssignmentById(db, created.id as string);
			expect(fetched).toBeNull();
		});

		it('throws NotFoundError for non-existent assignment', async () => {
			await expect(deleteAssignment(db, 'nonexistent00000001')).rejects.toThrow();
		});
	});

	// =========================================================================
	// Student Schedule View - /api/students/[id]/schedule
	// =========================================================================

	describe('Student Schedule View - GET /api/students/[id]/schedule', () => {
		it('returns student schedule with assignments', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create assignments
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15'
			});
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-16'
			});

			const schedule = await getStudentScheduleData(db, student.id as string);

			expect(schedule).not.toBeNull();
			expect(schedule!.student.id).toBe(student.id);
			expect(schedule!.student.name).toBe('Alice Johnson');
			expect(schedule!.assignments.length).toBe(2);
			expect(schedule!.summary.totalAssignedDays).toBe(2);
			expect(schedule!.summary.totalRequiredDays).toBe(10);
			expect(schedule!.clerkshipProgress).toHaveLength(1);
			expect(schedule!.clerkshipProgress[0].assignedDays).toBe(2);
		});

		it('returns null for non-existent student', async () => {
			const schedule = await getStudentScheduleData(db, 'nonexistent00000001');
			expect(schedule).toBeNull();
		});

		it('calculates progress correctly', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Create 3 out of 5 required days
			for (let i = 0; i < 3; i++) {
				await createAssignment(db, {
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: `2024-06-${15 + i}`
				});
			}

			const schedule = await getStudentScheduleData(db, student.id as string);

			expect(schedule!.clerkshipProgress[0].assignedDays).toBe(3);
			expect(schedule!.clerkshipProgress[0].remainingDays).toBe(2);
			expect(schedule!.clerkshipProgress[0].percentComplete).toBe(60);
			expect(schedule!.clerkshipProgress[0].isComplete).toBe(false);
		});
	});

	// =========================================================================
	// Preceptor Schedule View - /api/preceptors/[id]/schedule
	// =========================================================================

	describe('Preceptor Schedule View - GET /api/preceptors/[id]/schedule', () => {
		it('returns preceptor schedule with assignments', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create assignments
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15'
			});

			const schedule = await getPreceptorScheduleData(db, preceptor.id as string);

			expect(schedule).not.toBeNull();
			expect(schedule!.preceptor.id).toBe(preceptor.id);
			expect(schedule!.preceptor.name).toBe('Dr. Smith');
			expect(schedule!.assignments.length).toBe(1);
			expect(schedule!.assignedStudents).toHaveLength(1);
		});

		it('returns null for non-existent preceptor', async () => {
			const schedule = await getPreceptorScheduleData(db, 'nonexistent00000001');
			expect(schedule).toBeNull();
		});

		it('calculates capacity correctly with availability', async () => {
			const healthSystem = await createHealthSystem(db);
			const site = await createSiteDirect(db, healthSystem.id as string);
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			await linkPreceptorToSite(db, preceptor.id as string, site.id as string);

			// Set availability for some days
			await setAvailability(db, preceptor.id as string, site.id as string, '2024-06-15', true);
			await setAvailability(db, preceptor.id as string, site.id as string, '2024-06-16', true);
			await setAvailability(db, preceptor.id as string, site.id as string, '2024-06-17', false);
			await setAvailability(db, preceptor.id as string, site.id as string, '2024-06-18', true);

			const schedule = await getPreceptorScheduleData(db, preceptor.id as string);

			expect(schedule!.overallCapacity.availableDays).toBe(3);
			expect(schedule!.overallCapacity.assignedDays).toBe(0);
			expect(schedule!.overallCapacity.openSlots).toBe(3);
		});
	});

	// =========================================================================
	// Schedule Summary - /api/schedule/summary
	// =========================================================================

	describe('Schedule Summary - GET /api/schedule/summary', () => {
		it('returns summary with no assignments', async () => {
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const summary = await getScheduleSummaryData(db);

			expect(summary.stats.totalStudents).toBe(1);
			expect(summary.stats.totalAssignments).toBe(0);
			expect(summary.stats.studentsWithNoAssignments).toBe(1);
			expect(summary.studentsWithUnmetRequirements).toHaveLength(1);
			expect(summary.isComplete).toBe(false);
		});

		it('returns summary with fully scheduled students', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 3
			});

			// Create all required assignments
			for (let i = 0; i < 3; i++) {
				await createAssignment(db, {
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: `2024-06-${15 + i}`
				});
			}

			const summary = await getScheduleSummaryData(db);

			expect(summary.stats.studentsFullyScheduled).toBe(1);
			expect(summary.stats.studentsWithNoAssignments).toBe(0);
			expect(summary.studentsWithUnmetRequirements).toHaveLength(0);
			expect(summary.isComplete).toBe(true);
		});

		it('calculates clerkship breakdown correctly', async () => {
			const healthSystem = await createHealthSystem(db);
			const student1 = await createStudent(db, {
				name: 'Alice',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const student2 = await createStudent(db, {
				name: 'Bob',
				email: 'bob@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Alice: 2 days, Bob: 1 day
			await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15'
			});
			await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-16'
			});
			await createAssignment(db, {
				student_id: student2.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-17'
			});

			const summary = await getScheduleSummaryData(db);

			const fmBreakdown = summary.clerkshipBreakdown.find(c => c.clerkshipName === 'Family Medicine');
			expect(fmBreakdown!.totalAssignments).toBe(3);
			expect(fmBreakdown!.studentsAssigned).toBe(2);
		});
	});

	// =========================================================================
	// Reassign - POST /api/schedules/assignments/[id]/reassign
	// =========================================================================

	describe('Reassign - POST /api/schedules/assignments/[id]/reassign', () => {
		it('reassigns to new preceptor', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Jones',
				email: 'jones@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Use a future date to avoid "cannot modify past assignments" error
			const futureDate = new Date();
			futureDate.setMonth(futureDate.getMonth() + 1);
			const dateStr = futureDate.toISOString().split('T')[0];

			const assignment = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});

			const result = await reassignToPreceptor(
				db,
				assignment.id as string,
				preceptor2.id as string,
				false
			);

			expect(result.valid).toBe(true);
			expect(result.assignment?.preceptor_id).toBe(preceptor2.id);
		});

		it('supports dry run mode', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Jones',
				email: 'jones@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Use a future date to avoid "cannot modify past assignments" error
			const futureDate = new Date();
			futureDate.setMonth(futureDate.getMonth() + 1);
			const dateStr = futureDate.toISOString().split('T')[0];

			const assignment = await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});

			const result = await reassignToPreceptor(
				db,
				assignment.id as string,
				preceptor2.id as string,
				true // dry run
			);

			// Should show it would succeed
			expect(result.valid).toBe(true);

			// But assignment should not have changed
			const fetched = await getAssignmentById(db, assignment.id as string);
			expect(fetched!.preceptor_id).toBe(preceptor1.id);
		});
	});

	// =========================================================================
	// Swap - POST /api/schedules/assignments/swap
	// =========================================================================

	describe('Swap - POST /api/schedules/assignments/swap', () => {
		it('swaps preceptors between two assignments', async () => {
			const healthSystem = await createHealthSystem(db);
			const student1 = await createStudent(db, {
				name: 'Alice',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const student2 = await createStudent(db, {
				name: 'Bob',
				email: 'bob@example.com',
				cohort: '2024'
			});
			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Jones',
				email: 'jones@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Use a future date to avoid "cannot modify past assignments" error
			const futureDate = new Date();
			futureDate.setMonth(futureDate.getMonth() + 1);
			const dateStr = futureDate.toISOString().split('T')[0];

			const assignment1 = await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});
			const assignment2 = await createAssignment(db, {
				student_id: student2.id as string,
				preceptor_id: preceptor2.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});

			const result = await swapAssignments(
				db,
				assignment1.id as string,
				assignment2.id as string,
				false
			);

			expect(result.valid).toBe(true);

			// Verify the swap
			const updated1 = await getAssignmentById(db, assignment1.id as string);
			const updated2 = await getAssignmentById(db, assignment2.id as string);

			expect(updated1!.preceptor_id).toBe(preceptor2.id);
			expect(updated2!.preceptor_id).toBe(preceptor1.id);
		});

		it('supports dry run mode', async () => {
			const healthSystem = await createHealthSystem(db);
			const student1 = await createStudent(db, {
				name: 'Alice',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const student2 = await createStudent(db, {
				name: 'Bob',
				email: 'bob@example.com',
				cohort: '2024'
			});
			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Jones',
				email: 'jones@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Use a future date to avoid "cannot modify past assignments" error
			const futureDate = new Date();
			futureDate.setMonth(futureDate.getMonth() + 1);
			const dateStr = futureDate.toISOString().split('T')[0];

			const assignment1 = await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});
			const assignment2 = await createAssignment(db, {
				student_id: student2.id as string,
				preceptor_id: preceptor2.id as string,
				clerkship_id: clerkship.id as string,
				date: dateStr
			});

			const result = await swapAssignments(
				db,
				assignment1.id as string,
				assignment2.id as string,
				true // dry run
			);

			expect(result.valid).toBe(true);

			// Verify no actual swap happened
			const unchanged1 = await getAssignmentById(db, assignment1.id as string);
			const unchanged2 = await getAssignmentById(db, assignment2.id as string);

			expect(unchanged1!.preceptor_id).toBe(preceptor1.id);
			expect(unchanged2!.preceptor_id).toBe(preceptor2.id);
		});
	});

	// =========================================================================
	// Clear Assignments - DELETE /api/schedules
	// =========================================================================

	describe('Clear Assignments - DELETE /api/schedules', () => {
		it('clears all assignments when no date filter', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create multiple assignments
			for (let i = 0; i < 5; i++) {
				await createAssignment(db, {
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: `2024-06-${15 + i}`
				});
			}

			const deletedCount = await clearAllAssignments(db);

			expect(deletedCount).toBe(5);

			// Verify all are gone
			const remaining = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.execute();
			expect(remaining).toHaveLength(0);
		});

		it('clears only assignments from specified date', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create assignments on different dates
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-10' // Before cutoff
			});
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15' // On cutoff
			});
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-20' // After cutoff
			});

			const deletedCount = await clearAllAssignments(db, '2024-06-15');

			expect(deletedCount).toBe(2); // On and after cutoff

			// Verify only early assignment remains
			const remaining = await db
				.selectFrom('schedule_assignments')
				.selectAll()
				.execute();
			expect(remaining).toHaveLength(1);
			expect(remaining[0].date).toBe('2024-06-10');
		});
	});

	// =========================================================================
	// Bulk Create - Used by /api/schedules/generate
	// =========================================================================

	describe('Bulk Create Assignments', () => {
		it('creates multiple assignments at once', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			const assignments = [
				{
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-06-15',
					status: 'scheduled'
				},
				{
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-06-16',
					status: 'scheduled'
				},
				{
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-06-17',
					status: 'scheduled'
				}
			];

			const created = await bulkCreateAssignments(db, { assignments });

			expect(created).toHaveLength(3);
			expect(created[0].date).toBe('2024-06-15');
			expect(created[1].date).toBe('2024-06-16');
			expect(created[2].date).toBe('2024-06-17');
		});

		it('handles empty assignments array', async () => {
			const created = await bulkCreateAssignments(db, { assignments: [] });
			expect(created).toHaveLength(0);
		});
	});

	// =========================================================================
	// Multiple Preceptors per Clerkship
	// =========================================================================

	describe('Multiple Preceptors per Clerkship', () => {
		it('tracks multiple preceptors in student schedule', async () => {
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});
			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Jones',
				email: 'jones@hospital.com',
				health_system_id: healthSystem.id as string
			});
			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create assignments with different preceptors
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-15'
			});
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-16'
			});
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor2.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-06-17'
			});

			const schedule = await getStudentScheduleData(db, student.id as string);

			expect(schedule!.clerkshipProgress[0].preceptors).toHaveLength(2);

			const p1 = schedule!.clerkshipProgress[0].preceptors.find(p => p.id === preceptor1.id);
			const p2 = schedule!.clerkshipProgress[0].preceptors.find(p => p.id === preceptor2.id);

			expect(p1!.daysAssigned).toBe(2);
			expect(p2!.daysAssigned).toBe(1);
		});
	});

	// =========================================================================
	// Edge Cases
	// =========================================================================

	describe('Edge Cases', () => {
		it('handles student with no clerkships', async () => {
			const student = await createStudent(db, {
				name: 'Alice Johnson',
				email: 'alice@example.com',
				cohort: '2024'
			});

			const schedule = await getStudentScheduleData(db, student.id as string);

			expect(schedule).not.toBeNull();
			expect(schedule!.clerkshipProgress).toHaveLength(0);
			expect(schedule!.summary.totalRequiredDays).toBe(0);
		});

		it('handles preceptor with no availability data', async () => {
			const healthSystem = await createHealthSystem(db);
			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Smith',
				email: 'smith@hospital.com',
				health_system_id: healthSystem.id as string
			});

			const schedule = await getPreceptorScheduleData(db, preceptor.id as string);

			expect(schedule).not.toBeNull();
			expect(schedule!.overallCapacity.availableDays).toBe(0);
		});

		it('handles schedule summary with no students', async () => {
			const summary = await getScheduleSummaryData(db);

			expect(summary.stats.totalStudents).toBe(0);
			expect(summary.stats.totalAssignments).toBe(0);
			expect(summary.isComplete).toBe(true); // No students = complete
		});
	});
});
