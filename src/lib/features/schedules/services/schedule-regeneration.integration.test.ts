// @ts-nocheck
/**
 * Schedule Regeneration Integration Tests
 *
 * Tests the complete schedule regeneration workflow including:
 * - Full reoptimize strategy
 * - Minimal change strategy
 * - Preview/dry-run mode
 * - Past assignment preservation
 * - Future assignment handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';

// Import services
import { createStudent } from '$lib/features/students/services/student-service';
import { createPreceptor } from '$lib/features/preceptors/services/preceptor-service';
import { createClerkship } from '$lib/features/clerkships/services/clerkship-service';
import { setAvailability } from '$lib/features/preceptors/services/availability-service';
import {
	createAssignment,
	getAssignments,
	getAssignmentsByDateRange
} from './assignment-service';
import { clearAllAssignments } from './editing-service';
import {
	prepareRegenerationContext,
	analyzeRegenerationImpact
} from '$lib/features/scheduling/services/regeneration-service';
import { buildSchedulingContext } from '$lib/features/scheduling/services/context-builder';
import type { Selectable } from 'kysely';
import type { Students, Preceptors, Clerkships, ScheduleAssignments } from '$lib/db/types';

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
	// Students
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptors
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('site_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Clerkships
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

	// Clerkship configurations (required by clerkship service)
	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Schedule assignments
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

	// Preceptor availability
	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Blackout dates
	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

/**
 * Helper to get future date N days from now
 */
function getFutureDate(daysFromNow: number): string {
	const date = new Date();
	date.setDate(date.getDate() + daysFromNow);
	date.setHours(0, 0, 0, 0);
	return date.toISOString().split('T')[0];
}

/**
 * Helper to get past date N days ago
 */
function getPastDate(daysAgo: number): string {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	date.setHours(0, 0, 0, 0);
	return date.toISOString().split('T')[0];
}

describe('Schedule Regeneration Integration Tests', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('Batch 1: Basic Regeneration Scenarios', () => {
		it('preserves past assignments and clears future with full-reoptimize', async () => {
			// Setup: Create entities
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'preceptor@test.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 5
			});

			// Create past assignments (should be preserved)
			const pastDate1 = getPastDate(10);
			const pastDate2 = getPastDate(9);

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate1,
				status: 'completed'
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate2,
				status: 'completed'
			});

			// Create future assignments (should be cleared)
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(6);

			await createAssignment(db, {
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

			// Verify initial state: 4 total assignments
			const initialAssignments = await getAssignments(db);
			expect(initialAssignments).toHaveLength(4);

			// Clear future assignments (from today onwards)
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const deletedCount = await clearAllAssignments(db, todayString);
			expect(deletedCount).toBe(2); // Only future assignments deleted

			// Verify past assignments still exist
			const remainingAssignments = await getAssignments(db);
			expect(remainingAssignments).toHaveLength(2);
			expect(remainingAssignments.every((a) => a.date < todayString)).toBe(true);
		});

		it('credits past assignments toward student requirements', async () => {
			// Setup entities
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptor(db, {
				name: 'Dr. Test',
				email: 'preceptor@test.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 5 // Requires 5 days total
			});

			// Create 2 past completed assignments
			const pastDate1 = getPastDate(10);
			const pastDate2 = getPastDate(9);

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate1,
				status: 'completed'
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate2,
				status: 'completed'
			});

			// Build scheduling context
			const students = await db.selectFrom('students').selectAll().execute();
			const preceptors = await db.selectFrom('preceptors').selectAll().execute();
			const clerkships = await db.selectFrom('clerkships').selectAll().execute();
			const availabilityRecords = await db
				.selectFrom('preceptor_availability')
				.selectAll()
				.execute();

			const startDate = getPastDate(30);
			const endDate = getFutureDate(30);

			const context = buildSchedulingContext(
				students,
				preceptors,
				clerkships,
				[],
				availabilityRecords,
				startDate,
				endDate,
				{}
			);

			// Prepare regeneration from today
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const result = await prepareRegenerationContext(
				db,
				context,
				todayString,
				endDate,
				'full-reoptimize'
			);

			// Verify: Student should have 2 days credited
			expect(result.creditResult.totalPastAssignments).toBe(2);

			// Student requirement should be reduced from 5 to 3
			const studentRequirement = context.studentRequirements
				.get(student.id)
				?.get(clerkship.id);
			expect(studentRequirement).toBe(3); // 5 required - 2 completed = 3 remaining
		});

		it('analyzes impact in preview mode without making changes', async () => {
			// Setup entities
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor1 = await createPreceptor(db, {
				name: 'Dr. Available',
				email: 'available@test.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const preceptor2 = await createPreceptor(db, {
				name: 'Dr. Replacement',
				email: 'replacement@test.com',
				specialty: 'Cardiology',
				max_students: 2
			});

			const clerkship = await createClerkship(db, {
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 10
			});

			// Create past assignments
			const pastDate = getPastDate(5);
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: pastDate,
				status: 'completed'
			});

			// Create future assignments
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(6);

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate1
			});

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate2
			});

			// Build context
			const students = await db.selectFrom('students').selectAll().execute();
			const preceptors = await db.selectFrom('preceptors').selectAll().execute();
			const clerkships = await db.selectFrom('clerkships').selectAll().execute();
			const availabilityRecords = await db
				.selectFrom('preceptor_availability')
				.selectAll()
				.execute();

			const startDate = getPastDate(30);
			const endDate = getFutureDate(30);

			const context = buildSchedulingContext(
				students,
				preceptors,
				clerkships,
				[],
				availabilityRecords,
				startDate,
				endDate,
				{}
			);

			// Analyze impact (preview mode)
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const impact = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'full-reoptimize'
			);

			// Verify impact analysis
			expect(impact.pastAssignmentsCount).toBe(1);
			expect(impact.deletedCount).toBe(2); // Future assignments to delete
			expect(impact.summary.strategy).toBe('full-reoptimize');
			expect(impact.summary.willPreservePast).toBe(true);
			expect(impact.summary.regenerateFromDate).toBe(todayString);

			// Verify student progress tracking
			expect(impact.studentProgress).toHaveLength(1);
			expect(impact.studentProgress[0].completedDays).toBe(1);
			expect(impact.studentProgress[0].remainingDays).toBe(9); // 10 required - 1 completed

			// Verify NO changes were made to database
			const assignmentsAfter = await getAssignments(db);
			expect(assignmentsAfter).toHaveLength(3); // Still 3 assignments (1 past + 2 future)
		});
	});
});
