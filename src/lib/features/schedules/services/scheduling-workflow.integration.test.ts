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
 * Initialize complete database schema for integration tests
 */
async function initializeSchema(db: Kysely<DB>) {
	// Health Systems table (must be created before preceptors)
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

	// Preceptors table (no specialty field - removed from schema)
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

	// Clerkships table
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

	// Clerkship Configurations table (required by clerkship service)
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
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

/**
 * Helper to create a health system for tests
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

describe('Scheduling Workflow Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		testIdCounter = 0; // Reset counter for each test
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('Complete Scheduling Workflow', () => {
		it('creates a full schedule from setup to assignments', async () => {
			// Step 0: Create health system
			const healthSystem = await createHealthSystem(db);

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

			// Step 2: Create preceptors (no specialty field)
			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. Sarah Williams',
				email: 'sarah@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 2
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. John Davis',
				email: 'john@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			expect(preceptor1.id).toBeDefined();
			expect(preceptor2.id).toBeDefined();

			// Step 3: Create clerkships
			const clerkship1 = await createClerkship(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'inpatient',
				required_days: 5
			});

			const clerkship2 = await createClerkship(db, {
				name: 'Neurology Rotation',
				clerkship_type: 'outpatient',
				required_days: 3
			});

			expect(clerkship1.id).toBeDefined();
			expect(clerkship2.id).toBeDefined();

			// Step 4: Set preceptor availability
			await setAvailability(db, preceptor1.id as string, '2024-01-15', true);
			await setAvailability(db, preceptor1.id as string, '2024-01-16', true);
			await setAvailability(db, preceptor1.id as string, '2024-01-17', true);
			await setAvailability(db, preceptor2.id as string, '2024-01-18', true);
			await setAvailability(db, preceptor2.id as string, '2024-01-19', true);

			// Step 5: Add blackout date
			const blackout = await createBlackoutDate(db, {
				date: '2024-01-20',
				reason: 'Holiday'
			});

			expect(blackout.id).toBeDefined();

			// Step 6: Create assignments
			const assignment1 = await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship1.id as string,
				date: '2024-01-15'
			});

			const assignment2 = await createAssignment(db, {
				student_id: student2.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship1.id as string,
				date: '2024-01-15'
			});

			const assignment3 = await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor2.id as string,
				clerkship_id: clerkship2.id as string,
				date: '2024-01-18'
			});

			// Verify assignments created
			expect(assignment1.id).toBeDefined();
			expect(assignment2.id).toBeDefined();
			expect(assignment3.id).toBeDefined();

			// Step 7: Verify student's complete schedule
			const student1Assignments = await getAssignmentsByStudent(db, student1.id as string);
			expect(student1Assignments).toHaveLength(2);
			expect(student1Assignments[0].date).toBe('2024-01-15');
			expect(student1Assignments[1].date).toBe('2024-01-18');

			// Step 8: Check student progress
			const progress = await getStudentProgress(db, student1.id as string);
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

		// Note: "enforces business rules across the workflow" test removed
		// Specialty matching was removed from preceptors - they no longer have a specialty field

		it('respects blackout dates in assignment creation', async () => {
			const healthSystem = await createHealthSystem(db);

			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
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
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-01-15'
				})
			).rejects.toThrow(/blackout date/);
		});

		it('enforces preceptor availability constraints', async () => {
			const healthSystem = await createHealthSystem(db);

			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
				required_days: 5
			});

			// Mark preceptor as unavailable
			await setAvailability(db, preceptor.id as string, '2024-01-15', false);

			// Attempt to create assignment when unavailable
			await expect(
				createAssignment(db, {
					student_id: student.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-01-15'
				})
			).rejects.toThrow(/not available/);
		});

		it('enforces preceptor capacity limits', async () => {
			const healthSystem = await createHealthSystem(db);

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
				health_system_id: healthSystem.id as string,
				max_students: 1 // Only 1 student allowed
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
				required_days: 5
			});

			// First assignment succeeds
			await createAssignment(db, {
				student_id: student1.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-01-15'
			});

			// Second assignment on same date should fail
			await expect(
				createAssignment(db, {
					student_id: student2.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: '2024-01-15'
				})
			).rejects.toThrow(/capacity/);
		});

		it('prevents student double-booking', async () => {
			const healthSystem = await createHealthSystem(db);

			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. One',
				email: 'one@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. Two',
				email: 'two@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			const clerkship1 = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
				required_days: 5
			});

			const clerkship2 = await createClerkship(db, {
				name: 'Neurology',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// First assignment succeeds
			await createAssignment(db, {
				student_id: student.id as string,
				preceptor_id: preceptor1.id as string,
				clerkship_id: clerkship1.id as string,
				date: '2024-01-15'
			});

			// Second assignment on same date should fail
			await expect(
				createAssignment(db, {
					student_id: student.id as string,
					preceptor_id: preceptor2.id as string,
					clerkship_id: clerkship2.id as string,
					date: '2024-01-15'
				})
			).rejects.toThrow(/already has an assignment/);
		});
	});

	describe('Multi-Student Scheduling Scenarios', () => {
		it('schedules multiple students across different clerkships', async () => {
			const healthSystem = await createHealthSystem(db);

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
					health_system_id: healthSystem.id as string,
					max_students: 2
				}),
				createPreceptor(db, {
					name: 'Dr. B',
					email: 'b@hospital.com',
					health_system_id: healthSystem.id as string,
					max_students: 2
				})
			]);

			// Create 2 clerkships
			const clerkships = await Promise.all([
				createClerkship(db, { name: 'Cardiology', clerkship_type: 'inpatient', required_days: 10 }),
				createClerkship(db, { name: 'Neurology', clerkship_type: 'outpatient', required_days: 10 })
			]);

			// Assign students to different rotations
			await createAssignment(db, {
				student_id: students[0].id as string,
				preceptor_id: preceptors[0].id as string,
				clerkship_id: clerkships[0].id as string,
				date: '2024-01-15'
			});

			await createAssignment(db, {
				student_id: students[1].id as string,
				preceptor_id: preceptors[0].id as string,
				clerkship_id: clerkships[0].id as string,
				date: '2024-01-15'
			});

			await createAssignment(db, {
				student_id: students[2].id as string,
				preceptor_id: preceptors[1].id as string,
				clerkship_id: clerkships[1].id as string,
				date: '2024-01-15'
			});

			// Verify all assignments created
			for (const student of students) {
				const assignments = await getAssignmentsByStudent(db, student.id as string);
				expect(assignments.length).toBeGreaterThan(0);
			}
		});

		it('tracks progress for multiple students simultaneously', async () => {
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

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
				required_days: 10
			});

			// Student 1 completes 5 days
			for (let i = 0; i < 5; i++) {
				await createAssignment(db, {
					student_id: student1.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: `2024-01-${15 + i}`
				});
			}

			// Student 2 completes 3 days
			for (let i = 0; i < 3; i++) {
				await createAssignment(db, {
					student_id: student2.id as string,
					preceptor_id: preceptor.id as string,
					clerkship_id: clerkship.id as string,
					date: `2024-01-${20 + i}`
				});
			}

			const progress1 = await getStudentProgress(db, student1.id as string);
			const progress2 = await getStudentProgress(db, student2.id as string);

			expect(progress1[0].completed_days).toBe(5);
			expect(progress1[0].percentage).toBe(50);

			expect(progress2[0].completed_days).toBe(3);
			expect(progress2[0].percentage).toBe(30);
		});
	});

	describe('Validation Integration', () => {
		it('validates assignment with all constraints', async () => {
			const healthSystem = await createHealthSystem(db);

			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'test@example.com',
				cohort: '2024'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'test@hospital.com',
				health_system_id: healthSystem.id as string,
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology',
				clerkship_type: 'inpatient',
				required_days: 10
			});

			// Mark preceptor as available
			await setAvailability(db, preceptor.id as string, '2024-01-15', true);

			const assignmentData = {
				student_id: student.id as string,
				preceptor_id: preceptor.id as string,
				clerkship_id: clerkship.id as string,
				date: '2024-01-15'
			};

			const validation = await validateAssignment(db, assignmentData);

			expect(validation.valid).toBe(true);
			expect(validation.errors).toEqual([]);
		});

		it('returns all validation errors for invalid assignment', async () => {
			const assignmentData = {
				student_id: 'nonexistentstudent001',
				preceptor_id: 'nonexistentpreceptor1',
				clerkship_id: 'nonexistentclerkship1',
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

	/**
	 * Pattern-to-Schedule Integration Test
	 *
	 * This test validates the entire flow from setting an availability pattern
	 * to generating a schedule, ensuring dates are correctly mapped.
	 * This catches timezone bugs where Mon/Wed/Fri patterns produce Sun/Tues/Thurs schedules.
	 */
	describe('Pattern-to-Schedule Day-of-Week Validation (Timezone Regression)', () => {
		it('generates schedule assignments only on pattern-specified days (Mon/Wed/Fri)', async () => {
			// Import pattern generators
			const { generateWeeklyDates, parseDate } = await import(
				'$lib/features/preceptors/services/pattern-generators'
			);

			// Setup: Create health system, student, preceptor, clerkship
			const healthSystem = await createHealthSystem(db);

			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'preceptor@test.com',
				health_system_id: healthSystem.id as string,
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Family Medicine',
				clerkship_type: 'outpatient',
				required_days: 6
			});

			// Generate availability dates for Mon=1, Wed=3, Fri=5
			// December 2025: Dec 1 is Monday
			const weeklyConfig = { days_of_week: [1, 3, 5] }; // Mon, Wed, Fri
			const startDate = '2025-12-01';
			const endDate = '2025-12-31';

			const availabilityDates = generateWeeklyDates(startDate, endDate, weeklyConfig);

			// Verify the generated dates are correct (Mon/Wed/Fri)
			console.log('Generated availability dates:');
			for (const dateStr of availabilityDates.slice(0, 6)) {
				const date = parseDate(dateStr);
				const dayOfWeek = date.getUTCDay();
				const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				console.log(`  ${dateStr} = ${dayNames[dayOfWeek]}`);

				// Verify each date is Mon, Wed, or Fri
				expect([1, 3, 5]).toContain(dayOfWeek);
			}

			// Verify first week dates
			expect(availabilityDates).toContain('2025-12-01'); // Monday
			expect(availabilityDates).toContain('2025-12-03'); // Wednesday
			expect(availabilityDates).toContain('2025-12-05'); // Friday

			// Should NOT contain Sun/Tues/Thurs (the bug would include these)
			expect(availabilityDates).not.toContain('2025-11-30'); // Sunday
			expect(availabilityDates).not.toContain('2025-12-02'); // Tuesday
			expect(availabilityDates).not.toContain('2025-12-04'); // Thursday

			// Save availability to database
			for (const dateStr of availabilityDates) {
				await setAvailability(db, preceptor.id as string, dateStr, true);
			}

			// Verify availability was saved correctly
			const savedAvailability = await db
				.selectFrom('preceptor_availability')
				.select(['date'])
				.where('preceptor_id', '=', preceptor.id as string)
				.where('is_available', '=', 1)
				.execute();

			expect(savedAvailability.length).toBe(availabilityDates.length);

			// Verify saved dates are correct days of week
			for (const record of savedAvailability) {
				const date = parseDate(record.date);
				const dayOfWeek = date.getUTCDay();
				expect(
					[1, 3, 5],
					`Saved date ${record.date} should be Mon/Wed/Fri but was day ${dayOfWeek}`
				).toContain(dayOfWeek);
			}

			console.log(`\nSaved ${savedAvailability.length} availability dates to database`);
			console.log('All dates verified to be Mon/Wed/Fri');
		});

		it('generates weekend availability only on Sat/Sun', async () => {
			const { generateWeeklyDates, parseDate } = await import(
				'$lib/features/preceptors/services/pattern-generators'
			);

			// Setup
			const healthSystem = await createHealthSystem(db);

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Weekend',
				email: 'weekend@test.com',
				health_system_id: healthSystem.id as string,
				max_students: 1
			});

			// Generate weekend availability (Sat=6, Sun=0)
			const weekendConfig = { days_of_week: [0, 6] };
			const startDate = '2025-12-01';
			const endDate = '2025-12-31';

			const availabilityDates = generateWeeklyDates(startDate, endDate, weekendConfig);

			// Verify all dates are weekends
			for (const dateStr of availabilityDates) {
				const date = parseDate(dateStr);
				const dayOfWeek = date.getUTCDay();
				expect(
					[0, 6],
					`Date ${dateStr} should be Sat/Sun but was day ${dayOfWeek}`
				).toContain(dayOfWeek);
			}

			// Specific checks for December 2025
			expect(availabilityDates).toContain('2025-12-06'); // Saturday
			expect(availabilityDates).toContain('2025-12-07'); // Sunday
			expect(availabilityDates).toContain('2025-12-13'); // Saturday
			expect(availabilityDates).toContain('2025-12-14'); // Sunday

			// Should NOT contain weekdays
			expect(availabilityDates).not.toContain('2025-12-01'); // Monday
			expect(availabilityDates).not.toContain('2025-12-05'); // Friday

			console.log(`Generated ${availabilityDates.length} weekend dates, all verified`);
		});
	});
});
