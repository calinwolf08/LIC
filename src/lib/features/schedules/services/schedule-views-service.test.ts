// @ts-nocheck
/**
 * Schedule Views Service Tests
 *
 * Unit tests for student schedule, preceptor schedule, and summary views
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import {
	getStudentScheduleData,
	getPreceptorScheduleData,
	getScheduleSummaryData
} from './schedule-views-service';

// Mock the scheduling period service
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
 * Initialize database schema for tests
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
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Health systems table
	await db.schema
		.createTable('health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('location', 'text')
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
		.addColumn('specialty', 'text')
		.addColumn('clerkship_type', 'text')
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
 * Helper to insert test data
 */
async function insertTestData(
	db: Kysely<DB>,
	data: {
		students?: Array<{ id: string; name: string; email: string }>;
		preceptors?: Array<{ id: string; name: string; email: string; health_system_id?: string }>;
		healthSystems?: Array<{ id: string; name: string }>;
		clerkships?: Array<{ id: string; name: string; specialty: string; required_days: number }>;
		assignments?: Array<{ id: string; student_id: string; preceptor_id: string; clerkship_id: string; date: string; status: string }>;
		availability?: Array<{ id: string; preceptor_id: string; date: string; is_available: number }>;
	}
) {
	const timestamp = new Date().toISOString();

	if (data.healthSystems) {
		for (const hs of data.healthSystems) {
			await db.insertInto('health_systems').values({
				...hs,
				location: null,
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}

	if (data.students) {
		for (const s of data.students) {
			await db.insertInto('students').values({
				...s,
				cohort: '2024',
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}

	if (data.preceptors) {
		for (const p of data.preceptors) {
			await db.insertInto('preceptors').values({
				id: p.id,
				name: p.name,
				email: p.email,
				phone: null,
				health_system_id: p.health_system_id || null,
				site_id: null,
				max_students: 2,
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}

	if (data.clerkships) {
		for (const c of data.clerkships) {
			await db.insertInto('clerkships').values({
				id: c.id,
				name: c.name,
				specialty: c.specialty,
				clerkship_type: 'outpatient',
				required_days: c.required_days,
				description: null,
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}

	if (data.assignments) {
		for (const a of data.assignments) {
			await db.insertInto('schedule_assignments').values({
				...a,
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}

	if (data.availability) {
		for (const a of data.availability) {
			await db.insertInto('preceptor_availability').values({
				...a,
				created_at: timestamp,
				updated_at: timestamp
			}).execute();
		}
	}
}

describe('Schedule Views Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		testIdCounter = 0;
		db = createTestDb();
		await initializeSchema(db);

		// Mock active period
		vi.mocked(getActiveSchedulingPeriod).mockResolvedValue({
			id: generateTestId('clperiod'),
			name: 'Fall 2024',
			start_date: '2024-01-01',
			end_date: '2024-03-31',
			is_active: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});
	});

	afterEach(async () => {
		await db.destroy();
		vi.clearAllMocks();
	});

	describe('getStudentScheduleData()', () => {
		it('returns null for non-existent student', async () => {
			const result = await getStudentScheduleData(db, 'nonexistent00000001');
			expect(result).toBeNull();
		});

		it('returns student data with no assignments', async () => {
			const studentId = generateTestId('clstudent');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }]
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result).not.toBeNull();
			expect(result!.student.id).toBe(studentId);
			expect(result!.student.name).toBe('Alice Johnson');
			expect(result!.student.email).toBe('alice@example.com');
			expect(result!.summary.totalAssignedDays).toBe(0);
			expect(result!.summary.clerkshipsWithNoAssignments).toBe(1);
			expect(result!.assignments).toHaveLength(0);
		});

		it('calculates progress correctly with assignments', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
				]
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result).not.toBeNull();
			expect(result!.summary.totalAssignedDays).toBe(3);
			expect(result!.summary.totalRequiredDays).toBe(10);
			expect(result!.summary.overallPercentComplete).toBe(30); // 3/10 = 30%
			expect(result!.clerkshipProgress).toHaveLength(1);

			const fmProgress = result!.clerkshipProgress[0];
			expect(fmProgress.clerkshipName).toBe('Family Medicine');
			expect(fmProgress.assignedDays).toBe(3);
			expect(fmProgress.requiredDays).toBe(10);
			expect(fmProgress.remainingDays).toBe(7);
			expect(fmProgress.percentComplete).toBe(30);
			expect(fmProgress.isComplete).toBe(false);
		});

		it('tracks preceptors per clerkship', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId1 = generateTestId('clpreceptor');
			const preceptorId2 = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [
					{ id: preceptorId1, name: 'Dr. Smith', email: 'smith@hospital.com' },
					{ id: preceptorId2, name: 'Dr. Jones', email: 'jones@hospital.com' }
				],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId1, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId1, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId2, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
				]
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result!.clerkshipProgress[0].preceptors).toHaveLength(2);
			const preceptor1 = result!.clerkshipProgress[0].preceptors.find(p => p.id === preceptorId1);
			expect(preceptor1?.daysAssigned).toBe(2);
			const preceptor2 = result!.clerkshipProgress[0].preceptors.find(p => p.id === preceptorId2);
			expect(preceptor2?.daysAssigned).toBe(1);
		});

		it('includes period information', async () => {
			const studentId = generateTestId('clstudent');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				clerkships: []
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result!.period).not.toBeNull();
			expect(result!.period!.name).toBe('Fall 2024');
			expect(result!.period!.startDate).toBe('2024-01-01');
			expect(result!.period!.endDate).toBe('2024-03-31');
		});

		it('handles no active period', async () => {
			vi.mocked(getActiveSchedulingPeriod).mockResolvedValue(null);

			const studentId = generateTestId('clstudent');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				clerkships: []
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result).not.toBeNull();
			expect(result!.period).toBeNull();
		});

		it('builds calendar months correctly', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' }
				]
			});

			const result = await getStudentScheduleData(db, studentId);

			expect(result!.calendar).toBeDefined();
			expect(result!.calendar.length).toBeGreaterThan(0);

			// Should have January, February, March for period 2024-01-01 to 2024-03-31
			expect(result!.calendar.length).toBe(3);
			expect(result!.calendar[0].monthName).toContain('January');
		});
	});

	describe('getPreceptorScheduleData()', () => {
		it('returns null for non-existent preceptor', async () => {
			const result = await getPreceptorScheduleData(db, 'nonexistent00000001');
			expect(result).toBeNull();
		});

		it('returns preceptor data with no assignments', async () => {
			const preceptorId = generateTestId('clpreceptor');

			await insertTestData(db, {
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result).not.toBeNull();
			expect(result!.preceptor.id).toBe(preceptorId);
			expect(result!.preceptor.name).toBe('Dr. Smith');
			expect(result!.preceptor.email).toBe('smith@hospital.com');
			expect(result!.overallCapacity.assignedDays).toBe(0);
			expect(result!.assignments).toHaveLength(0);
		});

		it('calculates capacity based on availability', async () => {
			const preceptorId = generateTestId('clpreceptor');

			await insertTestData(db, {
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				availability: [
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-15', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-16', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-17', is_available: 0 }, // unavailable
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-18', is_available: 1 }
				]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result!.overallCapacity.availableDays).toBe(3);
			expect(result!.overallCapacity.openSlots).toBe(3);
			expect(result!.overallCapacity.utilizationPercent).toBe(0);
		});

		it('calculates utilization with assignments', async () => {
			const preceptorId = generateTestId('clpreceptor');
			const studentId = generateTestId('clstudent');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				availability: [
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-15', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-16', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-17', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-18', is_available: 1 }
				],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' }
				]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result!.overallCapacity.availableDays).toBe(4);
			expect(result!.overallCapacity.assignedDays).toBe(2);
			expect(result!.overallCapacity.openSlots).toBe(2);
			expect(result!.overallCapacity.utilizationPercent).toBe(50); // 2/4 = 50%
		});

		it('groups assignments by student', async () => {
			const preceptorId = generateTestId('clpreceptor');
			const studentId1 = generateTestId('clstudent');
			const studentId2 = generateTestId('clstudent');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [
					{ id: studentId1, name: 'Alice Johnson', email: 'alice@example.com' },
					{ id: studentId2, name: 'Bob Smith', email: 'bob@example.com' }
				],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId2, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
				]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result!.assignedStudents).toHaveLength(2);

			const alice = result!.assignedStudents.find(s => s.studentId === studentId1);
			expect(alice?.daysAssigned).toBe(2);

			const bob = result!.assignedStudents.find(s => s.studentId === studentId2);
			expect(bob?.daysAssigned).toBe(1);
		});

		it('includes health system name when available', async () => {
			const healthSystemId = generateTestId('clhs');
			const preceptorId = generateTestId('clpreceptor');

			await insertTestData(db, {
				healthSystems: [{ id: healthSystemId, name: 'University Hospital' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com', health_system_id: healthSystemId }]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result!.preceptor.healthSystemName).toBe('University Hospital');
		});

		it('calculates monthly capacity breakdown', async () => {
			const preceptorId = generateTestId('clpreceptor');
			const studentId = generateTestId('clstudent');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				availability: [
					// January availability
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-15', is_available: 1 },
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-01-16', is_available: 1 },
					// February availability
					{ id: generateTestId('clavail'), preceptor_id: preceptorId, date: '2024-02-15', is_available: 1 }
				],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' }
				]
			});

			const result = await getPreceptorScheduleData(db, preceptorId);

			expect(result!.monthlyCapacity.length).toBeGreaterThan(0);

			const january = result!.monthlyCapacity.find(m => m.periodName.includes('January'));
			expect(january).toBeDefined();
			expect(january!.availableDays).toBe(2);
			expect(january!.assignedDays).toBe(1);
		});
	});

	describe('getScheduleSummaryData()', () => {
		it('returns empty summary with no data', async () => {
			const result = await getScheduleSummaryData(db);

			expect(result.stats.totalStudents).toBe(0);
			expect(result.stats.totalAssignments).toBe(0);
			expect(result.stats.totalPreceptors).toBe(0);
			expect(result.isComplete).toBe(true); // No students = complete
		});

		it('identifies students with unmet requirements', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' }
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.isComplete).toBe(false);
			expect(result.studentsWithUnmetRequirements).toHaveLength(1);
			expect(result.studentsWithUnmetRequirements[0].studentId).toBe(studentId);
			expect(result.studentsWithUnmetRequirements[0].totalGap).toBe(8); // 10 - 2 = 8
		});

		it('categorizes students correctly', async () => {
			const studentId1 = generateTestId('clstudent'); // fully scheduled
			const studentId2 = generateTestId('clstudent'); // partially scheduled
			const studentId3 = generateTestId('clstudent'); // no assignments
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [
					{ id: studentId1, name: 'Alice Johnson', email: 'alice@example.com' },
					{ id: studentId2, name: 'Bob Smith', email: 'bob@example.com' },
					{ id: studentId3, name: 'Charlie Brown', email: 'charlie@example.com' }
				],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 2 }],
				assignments: [
					// Alice gets 2 days (fully scheduled)
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					// Bob gets 1 day (partially scheduled)
					{ id: generateTestId('classign'), student_id: studentId2, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
					// Charlie gets 0 days (no assignments)
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.stats.totalStudents).toBe(3);
			expect(result.stats.studentsFullyScheduled).toBe(1);
			expect(result.stats.studentsPartiallyScheduled).toBe(1);
			expect(result.stats.studentsWithNoAssignments).toBe(1);
		});

		it('calculates clerkship breakdown', async () => {
			const studentId1 = generateTestId('clstudent');
			const studentId2 = generateTestId('clstudent');
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId1 = generateTestId('clclerkship');
			const clerkshipId2 = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [
					{ id: studentId1, name: 'Alice Johnson', email: 'alice@example.com' },
					{ id: studentId2, name: 'Bob Smith', email: 'bob@example.com' }
				],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [
					{ id: clerkshipId1, name: 'Family Medicine', specialty: 'FM', required_days: 5 },
					{ id: clerkshipId2, name: 'Surgery', specialty: 'Surgery', required_days: 5 }
				],
				assignments: [
					// FM: 3 assignments to 2 students
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId1, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId1, date: '2024-01-16', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId2, preceptor_id: preceptorId, clerkship_id: clerkshipId1, date: '2024-01-17', status: 'confirmed' },
					// Surgery: 1 assignment to 1 student
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId2, date: '2024-01-18', status: 'confirmed' }
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.clerkshipBreakdown).toHaveLength(2);

			const fm = result.clerkshipBreakdown.find(c => c.clerkshipId === clerkshipId1);
			expect(fm?.totalAssignments).toBe(3);
			expect(fm?.studentsAssigned).toBe(2);

			const surgery = result.clerkshipBreakdown.find(c => c.clerkshipId === clerkshipId2);
			expect(surgery?.totalAssignments).toBe(1);
			expect(surgery?.studentsAssigned).toBe(1);
		});

		it('counts unique preceptors', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId1 = generateTestId('clpreceptor');
			const preceptorId2 = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [
					{ id: preceptorId1, name: 'Dr. Smith', email: 'smith@hospital.com' },
					{ id: preceptorId2, name: 'Dr. Jones', email: 'jones@hospital.com' }
				],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId1, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId1, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId2, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.stats.totalPreceptors).toBe(2);
		});

		it('sorts students by total gap descending', async () => {
			const studentId1 = generateTestId('clstudent'); // gap of 8
			const studentId2 = generateTestId('clstudent'); // gap of 9
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [
					{ id: studentId1, name: 'Alice Johnson', email: 'alice@example.com' },
					{ id: studentId2, name: 'Bob Smith', email: 'bob@example.com' }
				],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 10 }],
				assignments: [
					// Alice: 2 assignments = gap of 8
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId1, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' },
					// Bob: 1 assignment = gap of 9
					{ id: generateTestId('classign'), student_id: studentId2, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-17', status: 'confirmed' }
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.studentsWithUnmetRequirements[0].studentId).toBe(studentId2); // gap of 9 first
			expect(result.studentsWithUnmetRequirements[1].studentId).toBe(studentId1); // gap of 8 second
		});

		it('marks schedule as complete when all requirements met', async () => {
			const studentId = generateTestId('clstudent');
			const preceptorId = generateTestId('clpreceptor');
			const clerkshipId = generateTestId('clclerkship');

			await insertTestData(db, {
				students: [{ id: studentId, name: 'Alice Johnson', email: 'alice@example.com' }],
				preceptors: [{ id: preceptorId, name: 'Dr. Smith', email: 'smith@hospital.com' }],
				clerkships: [{ id: clerkshipId, name: 'Family Medicine', specialty: 'FM', required_days: 2 }],
				assignments: [
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-15', status: 'confirmed' },
					{ id: generateTestId('classign'), student_id: studentId, preceptor_id: preceptorId, clerkship_id: clerkshipId, date: '2024-01-16', status: 'confirmed' }
				]
			});

			const result = await getScheduleSummaryData(db);

			expect(result.isComplete).toBe(true);
			expect(result.studentsWithUnmetRequirements).toHaveLength(0);
		});
	});
});
