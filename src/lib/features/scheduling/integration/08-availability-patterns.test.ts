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
		it('should fail to schedule because continuous_single requires consecutive availability', async () => {
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

			// This SHOULD fail with continuous_single strategy
			// because the strategy requires ALL 5 consecutive days (Dec 1-5)
			// but preceptor is only available Mon/Wed/Fri (Dec 1, 3, 5)
			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
			expect(result.unmetRequirements[0].reason).toContain('No single preceptor available');
		});
	});

	describe('Test 3: Mon/Wed/Fri Availability with daily_rotation Strategy', () => {
		it('should also fail because daily_rotation uses consecutive calendar dates', async () => {
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

			// KEY INSIGHT: daily_rotation ALSO fails because it uses consecutive calendar dates
			// The engine takes the first 5 calendar dates (Dec 1, 2, 3, 4, 5) and looks for
			// preceptors available on each. Since the preceptor is only available Mon/Wed/Fri,
			// Dec 2 (Tue) and Dec 4 (Thu) have no available preceptors.
			expect(result.success).toBe(false);
			expect(result.assignments.length).toBe(0);
			expect(result.unmetRequirements.length).toBeGreaterThan(0);
			// The error should indicate no preceptor available on a specific date
			expect(result.unmetRequirements[0].reason).toContain('No preceptor available on date');
		});
	});

	describe('Test 4: Multiple Preceptors with Different Availability Patterns', () => {
		it('should find preceptor with matching consecutive availability', async () => {
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

			// Preceptor 1: Mon/Wed/Fri only
			const monWedFriDates = ['2025-12-01', '2025-12-03', '2025-12-05', '2025-12-08', '2025-12-10'];
			await createPreceptorAvailability(db, preceptorIds[0], siteId, monWedFriDates);

			// Preceptor 2: Every day (Dec 1-10)
			const consecutiveDates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorIds[1], siteId, consecutiveDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// Should succeed by finding Preceptor 2 (who has all consecutive days)
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All assignments should be to Preceptor 2
			expect(result.assignments.every((a) => a.preceptorId === preceptorIds[1])).toBe(true);
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
