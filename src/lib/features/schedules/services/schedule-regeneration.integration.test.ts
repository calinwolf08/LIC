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
import { nanoid } from 'nanoid';

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

	// Preceptor sites junction table
	await db.schema
		.createTable('preceptor_sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Preceptor availability
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
 * Create health system directly in database
 */
async function createHealthSystem(db: Kysely<DB>): Promise<{ id: string }> {
	const timestamp = new Date().toISOString();
	const id = nanoid();
	await db.insertInto('health_systems').values({
		id,
		name: 'Test Health System',
		location: 'Test Location',
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
	return { id };
}

/**
 * Create site directly in database
 */
async function createSite(db: Kysely<DB>, healthSystemId: string): Promise<{ id: string }> {
	const timestamp = new Date().toISOString();
	const id = nanoid();
	await db.insertInto('sites').values({
		id,
		name: 'Test Site',
		health_system_id: healthSystemId,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
	return { id };
}

/**
 * Link preceptor to site
 */
async function linkPreceptorToSite(db: Kysely<DB>, preceptorId: string, siteId: string): Promise<void> {
	const timestamp = new Date().toISOString();
	await db.insertInto('preceptor_sites').values({
		id: nanoid(),
		preceptor_id: preceptorId,
		site_id: siteId,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
}

/**
 * Create preceptor directly in database (bypasses service validation)
 */
async function createPreceptorDirect(
	db: Kysely<DB>,
	data: { name: string; email: string; health_system_id: string; max_students?: number }
): Promise<{ id: string; name: string }> {
	const timestamp = new Date().toISOString();
	const id = nanoid();
	await db.insertInto('preceptors').values({
		id,
		name: data.name,
		email: data.email,
		health_system_id: data.health_system_id,
		max_students: data.max_students ?? 2,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
	return { id, name: data.name };
}

/**
 * Create clerkship directly in database (bypasses service validation)
 */
async function createClerkshipDirect(
	db: Kysely<DB>,
	data: { name: string; clerkship_type: string; required_days: number }
): Promise<{ id: string }> {
	const timestamp = new Date().toISOString();
	const clerkshipId = nanoid();
	await db.insertInto('clerkships').values({
		id: clerkshipId,
		name: data.name,
		clerkship_type: data.clerkship_type,
		required_days: data.required_days,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
	// Also create clerkship configuration
	await db.insertInto('clerkship_configurations').values({
		id: nanoid(),
		clerkship_id: clerkshipId,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
	return { id: clerkshipId };
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
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'preceptor@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
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
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'preceptor@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
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
			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Available',
				email: 'available@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Replacement',
				email: 'replacement@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
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

	describe('Batch 2: Real-World Scenarios', () => {
		it('handles preceptor becoming unavailable mid-schedule with minimal-change', async () => {
			// This is THE key use case: A preceptor's availability changes mid-schedule
			// We want to preserve valid assignments and only change what's necessary

			// Setup: Two preceptors in same specialty
			const healthSystem = await createHealthSystem(db);
			const site = await createSite(db, healthSystem.id);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Original',
				email: 'original@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptor1.id, site.id);

			const preceptor2 = await createPreceptorDirect(db, {
				name: 'Dr. Replacement',
				email: 'replacement@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptor2.id, site.id);

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create past assignments (completed with preceptor1)
			const pastDate = getPastDate(5);
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: pastDate,
				status: 'completed'
			});

			// Create future assignments with preceptor1
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(6);
			const futureDate3 = getFutureDate(7);

			const future1 = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate1
			});

			const future2 = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate2
			});

			const future3 = await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate3
			});

			// Set availability: preceptor1 is no longer available for future dates
			// but preceptor2 is available
			await setAvailability(db, preceptor1.id, site.id, futureDate1, false);
			await setAvailability(db, preceptor1.id, site.id, futureDate2, false);
			await setAvailability(db, preceptor1.id, site.id, futureDate3, false);

			await setAvailability(db, preceptor2.id, site.id, futureDate1, true);
			await setAvailability(db, preceptor2.id, site.id, futureDate2, true);
			await setAvailability(db, preceptor2.id, site.id, futureDate3, true);

			// Build context for regeneration
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

			// Analyze impact with minimal-change strategy
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const impact = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'minimal-change'
			);

			// Verify impact analysis
			expect(impact.summary.strategy).toBe('minimal-change');
			expect(impact.pastAssignmentsCount).toBe(1); // 1 past assignment
			expect(impact.affectedCount).toBe(3); // All 3 future assignments affected (preceptor unavailable)

			// Should identify all 3 as replaceable (preceptor2 is available)
			expect(impact.replaceableAssignments).toHaveLength(3);
			expect(
				impact.replaceableAssignments.every((r) => r.replacementPreceptorId === preceptor2.id)
			).toBe(true);

			// Verify original assignments still in database (preview didn't change anything)
			const assignmentsAfter = await getAssignments(db);
			expect(assignmentsAfter).toHaveLength(4); // 1 past + 3 future
		});

		it('preserves unaffected assignments with minimal-change strategy', async () => {
			// Scenario: Two preceptors, one becomes unavailable for only some dates
			// We should preserve assignments with the still-available preceptor

			const healthSystem = await createHealthSystem(db);
			const site = await createSite(db, healthSystem.id);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptorCardio = await createPreceptorDirect(db, {
				name: 'Dr. Cardio',
				email: 'cardio@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptorCardio.id, site.id);

			const preceptorNeuro = await createPreceptorDirect(db, {
				name: 'Dr. Neuro',
				email: 'neuro@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptorNeuro.id, site.id);

			const clerkshipCardio = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			const clerkshipNeuro = await createClerkshipDirect(db, {
				name: 'Neurology Rotation',
				clerkship_type: 'inpatient',
				required_days: 5
			});

			// Create future assignments with different preceptors
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(6);

			// Cardiology assignment - preceptor stays available
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptorCardio.id,
				clerkship_id: clerkshipCardio.id,
				date: futureDate1
			});

			// Neurology assignment - preceptor becomes unavailable
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptorNeuro.id,
				clerkship_id: clerkshipNeuro.id,
				date: futureDate2
			});

			// Set availability: cardio stays available, neuro becomes unavailable
			await setAvailability(db, preceptorCardio.id, site.id, futureDate1, true);
			await setAvailability(db, preceptorNeuro.id, site.id, futureDate2, false);

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

			// Analyze with minimal-change
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const impact = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'minimal-change'
			);

			// Should preserve cardio assignment, affect only neuro
			expect(impact.preservedCount).toBe(1); // Cardio preserved
			expect(impact.affectedCount).toBe(1); // Neuro affected
			expect(impact.preservableAssignments[0].clerkship_id).toBe(clerkshipCardio.id);
			expect(impact.affectedAssignments[0].clerkship_id).toBe(clerkshipNeuro.id);
		});

		it('compares full-reoptimize vs minimal-change impact', async () => {
			// Same scenario analyzed with both strategies to show the difference

			const healthSystem = await createHealthSystem(db);
			const site = await createSite(db, healthSystem.id);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Original',
				email: 'original@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptor1.id, site.id);

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Create 3 future assignments
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(6);
			const futureDate3 = getFutureDate(7);

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

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate3
			});

			// Preceptor stays available
			await setAvailability(db, preceptor1.id, site.id, futureDate1, true);
			await setAvailability(db, preceptor1.id, site.id, futureDate2, true);
			await setAvailability(db, preceptor1.id, site.id, futureDate3, true);

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

			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			// Analyze with FULL-REOPTIMIZE
			const impactFullReoptimize = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'full-reoptimize'
			);

			// Analyze with MINIMAL-CHANGE
			const impactMinimalChange = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'minimal-change'
			);

			// Full-reoptimize: deletes everything, preserves nothing
			expect(impactFullReoptimize.deletedCount).toBe(3);
			expect(impactFullReoptimize.preservedCount).toBe(0);
			expect(impactFullReoptimize.summary.willPreserveFuture).toBe(false);

			// Minimal-change: preserves all valid assignments
			expect(impactMinimalChange.deletedCount).toBe(3); // Still counted as "to delete"
			expect(impactMinimalChange.preservedCount).toBe(3); // But will preserve them
			expect(impactMinimalChange.affectedCount).toBe(0); // None affected
			expect(impactMinimalChange.summary.willPreserveFuture).toBe(true);
		});
	});

	describe('Batch 3: Edge Cases and Error Scenarios', () => {
		it('handles no replacement preceptor available', async () => {
			// Edge case: Preceptor becomes unavailable but no other preceptor in same specialty

			const healthSystem = await createHealthSystem(db);
			const site = await createSite(db, healthSystem.id);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor1 = await createPreceptorDirect(db, {
				name: 'Dr. Only Cardio',
				email: 'onlycardio@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});
			await linkPreceptorToSite(db, preceptor1.id, site.id);

			// No other preceptors!

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Create future assignment
			const futureDate = getFutureDate(5);
			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor1.id,
				clerkship_id: clerkship.id,
				date: futureDate
			});

			// Preceptor becomes unavailable
			await setAvailability(db, preceptor1.id, site.id, futureDate, false);

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

			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayString = today.toISOString().split('T')[0];

			const impact = await analyzeRegenerationImpact(
				db,
				context,
				todayString,
				endDate,
				'minimal-change'
			);

			// Assignment is affected but no replacement available
			expect(impact.affectedCount).toBe(1);
			expect(impact.replaceableAssignments).toHaveLength(1);
			expect(impact.replaceableAssignments[0].replacementPreceptorId).toBeNull();
		});

		it('handles empty schedule (no assignments)', async () => {
			// Edge case: Analyze regeneration when there are no existing assignments

			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Don't create any assignments

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

			// Should handle empty schedule gracefully
			expect(impact.pastAssignmentsCount).toBe(0);
			expect(impact.deletedCount).toBe(0);
			expect(impact.preservedCount).toBe(0);
			expect(impact.affectedCount).toBe(0);
			expect(impact.studentProgress).toHaveLength(0);
		});

		it('handles all assignments in the past', async () => {
			// Edge case: Regenerate when all assignments are in the past (should preserve all)

			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Create only past assignments
			const pastDate1 = getPastDate(10);
			const pastDate2 = getPastDate(9);
			const pastDate3 = getPastDate(8);

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

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate3,
				status: 'completed'
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

			// All 3 assignments are past, none future
			expect(impact.pastAssignmentsCount).toBe(3);
			expect(impact.deletedCount).toBe(0); // Nothing to delete
			expect(impact.summary.willPreservePast).toBe(true);

			// Student should have credit for 3 days
			expect(impact.studentProgress).toHaveLength(1);
			expect(impact.studentProgress[0].completedDays).toBe(3);
			expect(impact.studentProgress[0].remainingDays).toBe(2); // 5 required - 3 completed
		});

		it('handles regenerating from specific future date', async () => {
			// Test regenerating from a specific date in the future (not today)

			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 10
			});

			// Create assignments at various future dates
			const futureDate1 = getFutureDate(5); // Near future
			const futureDate2 = getFutureDate(10); // Mid future
			const futureDate3 = getFutureDate(15); // Far future

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

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: futureDate3
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

			// Regenerate from futureDate2 (should preserve futureDate1, delete futureDate2 and futureDate3)
			const impact = await analyzeRegenerationImpact(
				db,
				context,
				futureDate2,
				endDate,
				'full-reoptimize'
			);

			// futureDate1 is "past" relative to regeneration point
			expect(impact.pastAssignmentsCount).toBe(1);
			// futureDate2 and futureDate3 will be deleted
			expect(impact.deletedCount).toBe(2);
		});

		it('handles clearAllAssignments with specific date correctly', async () => {
			// Integration test for clearing assignments from a specific date

			const healthSystem = await createHealthSystem(db);
			const student = await createStudent(db, {
				name: 'Test Student',
				email: 'student@test.com',
				cohort: '2025'
			});

			const preceptor = await createPreceptorDirect(db, {
				name: 'Dr. Test',
				email: 'test@test.com',
				health_system_id: healthSystem.id,
				max_students: 2
			});

			const clerkship = await createClerkshipDirect(db, {
				name: 'Cardiology Rotation',
				clerkship_type: 'outpatient',
				required_days: 5
			});

			// Create assignments at various dates
			const pastDate = getPastDate(5);
			const futureDate1 = getFutureDate(5);
			const futureDate2 = getFutureDate(10);

			await createAssignment(db, {
				student_id: student.id,
				preceptor_id: preceptor.id,
				clerkship_id: clerkship.id,
				date: pastDate,
				status: 'completed'
			});

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

			// Verify initial state
			const initialAssignments = await getAssignments(db);
			expect(initialAssignments).toHaveLength(3);

			// Clear from futureDate1 onwards
			const deletedCount = await clearAllAssignments(db, futureDate1);
			expect(deletedCount).toBe(2); // Only futureDate1 and futureDate2

			// Verify past assignment preserved
			const remainingAssignments = await getAssignments(db);
			expect(remainingAssignments).toHaveLength(1);
			expect(remainingAssignments[0].date).toBe(pastDate);
			expect(remainingAssignments[0].status).toBe('completed');
		});
	});
});
