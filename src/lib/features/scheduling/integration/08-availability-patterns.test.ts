/**
 * Integration Test Suite 8: Availability Pattern to Schedule Workflow
 *
 * Tests the complete flow from creating availability patterns to generating schedules.
 * This validates that:
 * 1. Patterns generate correct dates
 * 2. Dates are saved to preceptor_availability table
 * 3. Scheduling engine uses availability correctly
 * 4. Different strategies work with different availability patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestPreceptors,
	createTestStudents,
	createTestRequirement,
	createPreceptorAvailability,
	clearAllTestData,
	generateDateRange,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

describe('Integration Suite 8: Availability Pattern to Schedule Workflow', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Consecutive Daily Availability with continuous_single Strategy', () => {
		it('should successfully schedule when preceptor is available for all consecutive days', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement with continuous_single strategy
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Create CONSECUTIVE availability for all 5 days (Mon-Fri Dec 1-5, 2025)
			// Dec 1, 2025 is a Monday
			const startDate = '2025-12-01';
			const consecutiveDates = generateDateRange(startDate, 5);

			// createPreceptorAvailability expects an array of dates
			await createPreceptorAvailability(db, preceptorIds[0], siteId, consecutiveDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate,
				endDate: '2025-12-31',
				dryRun: false,
			});

			// Verify success
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Verify all 5 consecutive days were assigned
			const assignedDates = result.assignments.map((a) => a.date).sort();
			expect(assignedDates).toEqual(consecutiveDates);
		});
	});

	describe('Test 2: Mon/Wed/Fri Availability with continuous_single Strategy', () => {
		it('should successfully schedule using non-consecutive dates with same preceptor', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement with continuous_single strategy
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Create Mon/Wed/Fri availability (non-consecutive)
			// Dec 2025: Dec 1=Mon, Dec 3=Wed, Dec 5=Fri, Dec 8=Mon, Dec 10=Wed
			const monWedFriDates = [
				'2025-12-01', // Mon
				'2025-12-03', // Wed
				'2025-12-05', // Fri
				'2025-12-08', // Mon
				'2025-12-10', // Wed
			];

			// createPreceptorAvailability expects an array of dates
			await createPreceptorAvailability(db, preceptorIds[0], siteId, monWedFriDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// NEW EXPECTED BEHAVIOR: continuous_single should find N dates where
			// the SAME preceptor is available, regardless of whether dates are consecutive
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All assignments should be to the same preceptor
			expect(result.assignments.every((a) => a.preceptorId === preceptorIds[0])).toBe(true);

			// Assigned dates should be the Mon/Wed/Fri dates
			const assignedDates = result.assignments.map((a) => a.date).sort();
			expect(assignedDates).toEqual(monWedFriDates);
		});
	});

	describe('Test 3: Mon/Wed/Fri Availability with daily_rotation Strategy', () => {
		it('should successfully schedule by skipping days with no availability', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement with daily_rotation strategy
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'daily_rotation',
			});

			// Create preceptor
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Create Mon/Wed/Fri availability (5 specific dates)
			const monWedFriDates = [
				'2025-12-01', // Mon
				'2025-12-03', // Wed
				'2025-12-05', // Fri
				'2025-12-08', // Mon
				'2025-12-10', // Wed
			];

			// createPreceptorAvailability expects an array of dates
			await createPreceptorAvailability(db, preceptorIds[0], siteId, monWedFriDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// NEW EXPECTED BEHAVIOR: daily_rotation should skip days where no preceptor
			// is available and find N dates where ANY preceptor is available
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Assigned dates should be the Mon/Wed/Fri dates (skipping Tue/Thu)
			const assignedDates = result.assignments.map((a) => a.date).sort();
			expect(assignedDates).toEqual(monWedFriDates);
		});
	});

	describe('Test 3b: Daily Rotation with Multiple Preceptors', () => {
		it('should rotate between preceptors and not repeat same preceptor consecutively', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 4-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement with daily_rotation strategy
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 4,
				assignmentStrategy: 'daily_rotation',
			});

			// Create 2 preceptors
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Both preceptors available on same 4 dates
			const availableDates = ['2025-12-01', '2025-12-03', '2025-12-05', '2025-12-08'];
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);
			await createPreceptorAvailability(db, preceptorIds[1], siteId, availableDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(4);

			// Verify rotation - no two consecutive assignments should have same preceptor
			const sortedAssignments = result.assignments.sort((a, b) => a.date.localeCompare(b.date));
			for (let i = 1; i < sortedAssignments.length; i++) {
				expect(sortedAssignments[i].preceptorId).not.toBe(sortedAssignments[i - 1].preceptorId);
			}
		});
	});

	describe('Test 4: Multiple Preceptors with Different Availability Patterns', () => {
		it('should prefer preceptor with lower load when both have enough availability', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement with continuous_single strategy
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create 2 preceptors
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Preceptor 1: Mon/Wed/Fri only (5 dates - exactly enough)
			const monWedFriDates = ['2025-12-01', '2025-12-03', '2025-12-05', '2025-12-08', '2025-12-10'];
			await createPreceptorAvailability(db, preceptorIds[0], siteId, monWedFriDates);

			// Preceptor 2: Every day (Dec 1-10) - more availability
			const consecutiveDates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorIds[1], siteId, consecutiveDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// NEW BEHAVIOR: Both preceptors have at least 5 available dates
			// Either could be selected (sorted by load, both have 0)
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All assignments should be to the SAME preceptor (continuous_single)
			const preceptorId = result.assignments[0].preceptorId;
			expect(result.assignments.every((a) => a.preceptorId === preceptorId)).toBe(true);
		});
	});

	describe('Test 5: No Availability Records', () => {
		it('should fail when preceptor has no availability records', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor (but NO availability records)
			await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// Should fail - no preceptor available
			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('Test 6: Availability with is_available = false', () => {
		it('should ignore availability records where is_available is false', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			// Create requirement
			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create preceptor
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2,
			});

			// Create student
			const studentIds = await createTestStudents(db, 1);

			// Create availability records with is_available = false (unavailable)
			const dates = generateDateRange('2025-12-01', 5);
			for (const date of dates) {
				await db
					.insertInto('preceptor_availability')
					.values({
						id: `avail-${preceptorIds[0]}-${date}`,
						preceptor_id: preceptorIds[0],
						site_id: siteId,
						date,
						is_available: 0, // NOT available
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.execute();
			}

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// Should fail - preceptor has records but is NOT available
			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
		});
	});

	describe('Test 7: Validate Pattern Date Generation (Timezone Regression)', () => {
		it('should generate correct Mon/Wed/Fri dates without timezone shift', async () => {
			// Import pattern generators
			const { generateWeeklyDates, parseDate } = await import(
				'$lib/features/preceptors/services/pattern-generators'
			);

			// December 2025: Dec 1 is Monday
			const weeklyConfig = { days_of_week: [1, 3, 5] }; // Mon, Wed, Fri
			const startDate = '2025-12-01';
			const endDate = '2025-12-31';

			const generatedDates = generateWeeklyDates(startDate, endDate, weeklyConfig);

			// Verify dates are correct
			for (const dateStr of generatedDates) {
				const date = parseDate(dateStr);
				const dayOfWeek = date.getUTCDay();
				expect([1, 3, 5]).toContain(dayOfWeek);
			}

			// First week should have:
			expect(generatedDates).toContain('2025-12-01'); // Monday
			expect(generatedDates).toContain('2025-12-03'); // Wednesday
			expect(generatedDates).toContain('2025-12-05'); // Friday

			// Should NOT contain Tues/Thurs/Sat/Sun
			expect(generatedDates).not.toContain('2025-12-02'); // Tuesday
			expect(generatedDates).not.toContain('2025-12-04'); // Thursday
		});
	});
});
