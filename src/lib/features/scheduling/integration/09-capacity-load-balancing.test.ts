/**
 * Integration Test Suite 9: Capacity and Load Balancing
 *
 * Tests that the scheduling engine properly:
 * 1. Respects maxStudentsPerDay limits
 * 2. Tracks assignments across multiple students in a batch
 * 3. Load balances across available preceptors
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

describe('Integration Suite 9: Capacity and Load Balancing', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	describe('Test 1: Daily Capacity Limits', () => {
		it('should not assign more students to a preceptor than maxStudentsPerDay allows', async () => {
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

			// Create ONE preceptor with max_students_per_day = 1
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 1, // Only 1 student per day allowed
			});

			// Set capacity rule explicitly
			await db
				.insertInto('preceptor_capacity_rules')
				.values({
					id: `cap-${preceptorIds[0]}`,
					preceptor_id: preceptorIds[0],
					max_students_per_day: 1,
					max_students_per_year: 20, // Must be >= 15 (3 students × 5 days)
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Create 3 students
			const studentIds = await createTestStudents(db, 3);

			// Create availability for 15 days (enough for 3 students × 5 days each)
			const availableDates = generateDateRange('2025-12-01', 15);
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);

			// Run scheduling engine
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// With max_students_per_day = 1, each date can only have 1 assignment
			// So 3 students × 5 days = 15 assignments, each on a different date
			// Check that no date has more than 1 assignment
			const assignmentsByDate = new Map<string, number>();
			for (const assignment of result.assignments) {
				const count = assignmentsByDate.get(assignment.date) || 0;
				assignmentsByDate.set(assignment.date, count + 1);
			}

			// Each date should have at most 1 assignment
			for (const [date, count] of assignmentsByDate) {
				expect(count).toBeLessThanOrEqual(1);
			}

			// All 3 students should be successfully scheduled
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(15); // 3 students × 5 days
		});
	});

	describe('Test 2: Multiple Students Should Not Get Same Dates with Single-Capacity Preceptor', () => {
		it('should assign different dates to each student when preceptor has max 1 per day', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create ONE preceptor with max 1 student per day
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 1,
			});

			await db
				.insertInto('preceptor_capacity_rules')
				.values({
					id: `cap-${preceptorIds[0]}`,
					preceptor_id: preceptorIds[0],
					max_students_per_day: 1,
					max_students_per_year: 20,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Create 2 students
			const studentIds = await createTestStudents(db, 2);

			// Create availability for 10 days
			const availableDates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(10); // 2 students × 5 days

			// Get dates for each student
			const student1Dates = result.assignments
				.filter(a => a.studentId === studentIds[0])
				.map(a => a.date)
				.sort();
			const student2Dates = result.assignments
				.filter(a => a.studentId === studentIds[1])
				.map(a => a.date)
				.sort();

			// Students should have NO overlapping dates
			const overlap = student1Dates.filter(d => student2Dates.includes(d));
			expect(overlap.length).toBe(0);
		});
	});

	describe('Test 3: Load Balancing Across Multiple Preceptors', () => {
		it('should distribute students across preceptors when both have availability', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create TWO preceptors with max 1 student per day each
			const preceptorIds = await createTestPreceptors(db, 2, {
				healthSystemId,
				siteId,
				maxStudents: 1,
			});

			// Set capacity rules for both
			for (const preceptorId of preceptorIds) {
				await db
					.insertInto('preceptor_capacity_rules')
					.values({
						id: `cap-${preceptorId}`,
						preceptor_id: preceptorId,
						max_students_per_day: 1,
						max_students_per_year: 10,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.execute();
			}

			// Create 2 students
			const studentIds = await createTestStudents(db, 2);

			// Both preceptors available on same 5 days
			const availableDates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);
			await createPreceptorAvailability(db, preceptorIds[1], siteId, availableDates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(10); // 2 students × 5 days

			// Each student should be assigned to ONE preceptor (continuous_single)
			// But they should be DIFFERENT preceptors (since each can only take 1 per day)
			const student1Preceptor = result.assignments.find(a => a.studentId === studentIds[0])?.preceptorId;
			const student2Preceptor = result.assignments.find(a => a.studentId === studentIds[1])?.preceptorId;

			// With proper load balancing, students should get different preceptors
			// (assuming both preceptors have same availability on same dates)
			expect(student1Preceptor).toBeDefined();
			expect(student2Preceptor).toBeDefined();
			expect(student1Preceptor).not.toBe(student2Preceptor);
		});
	});

	describe('Test 4: Insufficient Capacity Should Fail Gracefully', () => {
		it('should report unmet requirements when preceptor capacity is exhausted', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create ONE preceptor with max 1 student per day
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 1,
			});

			await db
				.insertInto('preceptor_capacity_rules')
				.values({
					id: `cap-${preceptorIds[0]}`,
					preceptor_id: preceptorIds[0],
					max_students_per_day: 1,
					max_students_per_year: 5, // Only 5 total per year
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Create 3 students (need 15 slots, but only 5 available)
			const studentIds = await createTestStudents(db, 3);

			// Create availability for only 5 days
			const availableDates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// Only 1 student should be scheduled (5 days with 1 per day = 5 assignments)
			expect(result.assignments.length).toBe(5);

			// 2 students should have unmet requirements
			expect(result.unmetRequirements.length).toBe(2);
		});
	});

	describe('Test 5: Yearly Capacity Tracking Across Students', () => {
		it('should track yearly capacity across multiple students in same batch', async () => {
			// Setup: Health system and site
			const { healthSystemId, siteIds } = await createTestHealthSystem(db, 'Test Hospital', 1);
			const siteId = siteIds[0];

			// Create clerkship with 5-day requirement
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'Family Medicine');

			await createTestRequirement(db, clerkshipId, {
				requirementType: 'outpatient',
				requiredDays: 5,
				assignmentStrategy: 'continuous_single',
			});

			// Create ONE preceptor with max 7 students per year
			const preceptorIds = await createTestPreceptors(db, 1, {
				healthSystemId,
				siteId,
				maxStudents: 2, // 2 per day
			});

			await db
				.insertInto('preceptor_capacity_rules')
				.values({
					id: `cap-${preceptorIds[0]}`,
					preceptor_id: preceptorIds[0],
					max_students_per_day: 2,
					max_students_per_year: 7, // Only 7 assignment-days per year
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.execute();

			// Create 2 students (need 10 slots, but only 7 available yearly)
			const studentIds = await createTestStudents(db, 2);

			// Create availability for 10 days
			const availableDates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorIds[0], siteId, availableDates);

			// Run scheduling
			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
				dryRun: false,
			});

			// continuous_single is "all or nothing" - requires N days with same preceptor
			// First student: 5 days (5 of 7 yearly capacity used)
			// Second student: needs 5 days but only 2 remaining → fails entirely
			expect(result.assignments.length).toBe(5);

			// Should have 1 unmet requirement (second student got 0 of 5 days)
			expect(result.unmetRequirements.length).toBe(1);
			expect(result.unmetRequirements[0].assignedDays).toBe(0);
			expect(result.unmetRequirements[0].remainingDays).toBe(5);
		});
	});
});
