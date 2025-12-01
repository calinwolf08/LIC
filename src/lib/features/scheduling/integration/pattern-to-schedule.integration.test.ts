/**
 * Pattern-to-Schedule End-to-End Integration Test
 *
 * This test validates the COMPLETE flow from pattern creation to schedule generation,
 * verifying that Mon/Wed/Fri availability patterns produce Mon/Wed/Fri assignments.
 *
 * This is the definitive test for the timezone bug where dates were shifted by one day.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';

// Import the actual production code paths
import { generateWeeklyDates, parseDate } from '$lib/features/preceptors/services/pattern-generators';
import { SchedulingEngine } from '$lib/features/scheduling/services/scheduling-engine';
import { buildSchedulingContext } from '$lib/features/scheduling/services/context-builder';
import { getSchedulingDates } from '$lib/features/scheduling/utils/date-utils';
import {
	NoDoubleBookingConstraint,
	PreceptorAvailabilityConstraint,
	BlackoutDateConstraint
} from '$lib/features/scheduling/constraints';

function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	return new Kysely<DB>({
		dialect: new SqliteDialect({ database: sqlite })
	});
}

async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('cohort', 'text')
		.addColumn('created_at', 'text')
		.addColumn('updated_at', 'text')
		.execute();

	await db.schema
		.createTable('health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('location', 'text')
		.addColumn('description', 'text')
		.addColumn('created_at', 'text')
		.addColumn('updated_at', 'text')
		.execute();

	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('phone', 'text')
		.addColumn('max_students', 'integer')
		.addColumn('created_at', 'text')
		.addColumn('updated_at', 'text')
		.execute();

	await db.schema
		.createTable('clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text')
		.addColumn('required_days', 'integer')
		.addColumn('created_at', 'text')
		.addColumn('updated_at', 'text')
		.execute();

	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text')
		.addColumn('updated_at', 'text')
		.execute();
}

/**
 * Get the day of week name for a date string
 */
function getDayName(dateStr: string): string {
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const date = new Date(dateStr + 'T00:00:00.000Z');
	return dayNames[date.getUTCDay()];
}

/**
 * Get the UTC day of week number for a date string
 */
function getUTCDayOfWeek(dateStr: string): number {
	return new Date(dateStr + 'T00:00:00.000Z').getUTCDay();
}

describe('Pattern-to-Schedule End-to-End Integration', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	it('Mon/Wed/Fri pattern produces Mon/Wed/Fri schedule assignments', async () => {
		// =====================================================
		// STEP 1: Create test data
		// =====================================================
		const now = new Date().toISOString();

		await db.insertInto('health_systems').values({
			id: 'hs-1', name: 'Test Health System', created_at: now, updated_at: now
		}).execute();

		await db.insertInto('students').values({
			id: 'student-1', name: 'Test Student', email: 'student@test.com',
			created_at: now, updated_at: now
		}).execute();

		await db.insertInto('preceptors').values({
			id: 'preceptor-1', name: 'Dr. Test', email: 'dr@test.com',
			health_system_id: 'hs-1', max_students: 5,
			created_at: now, updated_at: now
		}).execute();

		await db.insertInto('clerkships').values({
			id: 'clerkship-1', name: 'Family Medicine', specialty: 'Family Medicine',
			required_days: 10, created_at: now, updated_at: now
		}).execute();

		// =====================================================
		// STEP 2: Generate availability dates using pattern-generators
		// This is the SAME code used by the UI
		// =====================================================
		const weeklyConfig = { days_of_week: [1, 3, 5] }; // Mon=1, Wed=3, Fri=5
		const startDate = '2025-12-01'; // Monday
		const endDate = '2025-12-31';

		const availabilityDates = generateWeeklyDates(startDate, endDate, weeklyConfig);

		console.log('\n=== STEP 2: Pattern Generator Output ===');
		console.log('First 6 generated availability dates:');
		for (const date of availabilityDates.slice(0, 6)) {
			console.log(`  ${date} = ${getDayName(date)}`);
		}

		// VERIFY: All generated dates are Mon/Wed/Fri
		for (const date of availabilityDates) {
			const dayOfWeek = getUTCDayOfWeek(date);
			expect([1, 3, 5], `Availability date ${date} should be Mon/Wed/Fri`).toContain(dayOfWeek);
		}

		// =====================================================
		// STEP 3: Save availability to database
		// This simulates what /api/preceptors/[id]/patterns/save does
		// =====================================================
		for (const date of availabilityDates) {
			await db.insertInto('preceptor_availability').values({
				id: `avail-${date}`,
				preceptor_id: 'preceptor-1',
				date: date,
				is_available: 1,
				created_at: now,
				updated_at: now
			}).execute();
		}

		// Verify saved correctly
		const savedAvailability = await db
			.selectFrom('preceptor_availability')
			.select(['date'])
			.execute();

		console.log('\n=== STEP 3: Saved Availability ===');
		console.log(`Saved ${savedAvailability.length} availability records`);

		// =====================================================
		// STEP 4: Generate scheduling dates using date-utils
		// This is what the SchedulingEngine uses internally
		// =====================================================
		const schedulingDates = getSchedulingDates(startDate, endDate, new Set());

		console.log('\n=== STEP 4: Scheduling Dates ===');
		console.log('First 7 scheduling dates:');
		for (const date of schedulingDates.slice(0, 7)) {
			console.log(`  ${date} = ${getDayName(date)}`);
		}

		// VERIFY: Dec 1, 2025 should be Monday
		expect(schedulingDates[0]).toBe('2025-12-01');
		expect(getUTCDayOfWeek(schedulingDates[0])).toBe(1); // Monday

		// =====================================================
		// STEP 5: Run the actual SchedulingEngine
		// =====================================================
		const students = await db.selectFrom('students').selectAll().execute();
		const preceptors = await db.selectFrom('preceptors').selectAll().execute();
		const clerkships = await db.selectFrom('clerkships').selectAll().execute();
		const availabilityRecords = await db.selectFrom('preceptor_availability').selectAll().execute();

		const engine = new SchedulingEngine([
			new NoDoubleBookingConstraint(),
			new PreceptorAvailabilityConstraint(),
			new BlackoutDateConstraint()
		]);

		const result = await engine.generateSchedule(
			students,
			preceptors,
			clerkships,
			[], // no blackout dates
			availabilityRecords,
			startDate,
			endDate
		);

		console.log('\n=== STEP 5: Schedule Generation Result ===');
		console.log(`Success: ${result.success}`);
		console.log(`Total assignments: ${result.assignments.length}`);
		console.log('First 10 assignments:');
		for (const assignment of result.assignments.slice(0, 10)) {
			console.log(`  ${assignment.date} = ${getDayName(assignment.date)}`);
		}

		// =====================================================
		// STEP 6: VERIFY - All assignments must be on Mon/Wed/Fri
		// =====================================================
		expect(result.assignments.length).toBeGreaterThan(0);

		const wrongDates: string[] = [];
		for (const assignment of result.assignments) {
			const dayOfWeek = getUTCDayOfWeek(assignment.date);
			if (![1, 3, 5].includes(dayOfWeek)) {
				wrongDates.push(`${assignment.date} (${getDayName(assignment.date)})`);
			}
		}

		if (wrongDates.length > 0) {
			console.log('\n=== FAILURE: Wrong dates found ===');
			for (const wrong of wrongDates) {
				console.log(`  ${wrong}`);
			}
		}

		expect(wrongDates, `Expected all assignments on Mon/Wed/Fri but found: ${wrongDates.join(', ')}`).toHaveLength(0);

		// Verify specific dates
		const assignmentDates = result.assignments.map(a => a.date);
		expect(assignmentDates).toContain('2025-12-01'); // Monday
		expect(assignmentDates).toContain('2025-12-03'); // Wednesday
		expect(assignmentDates).toContain('2025-12-05'); // Friday

		// Should NOT contain Sun/Tue/Thu
		expect(assignmentDates).not.toContain('2025-11-30'); // Sunday
		expect(assignmentDates).not.toContain('2025-12-02'); // Tuesday
		expect(assignmentDates).not.toContain('2025-12-04'); // Thursday

		console.log('\n=== SUCCESS: All assignments are on Mon/Wed/Fri ===');
	});
});
