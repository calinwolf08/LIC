/**
 * Integration Suite 13: Blackout Date Scheduling
 *
 * Tests that the scheduling engine properly respects blackout dates,
 * ensuring no assignments are made on system-wide closure dates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createTestClerkship,
	createTestHealthSystem,
	createTestStudents,
	createPreceptorAvailability,
	createTestPreceptor,
	createTestTeam,
	clearAllTestData,
	generateDateRange,
	getStudentAssignments,
} from '$lib/testing/integration-helpers';
import { ConfigurableSchedulingEngine } from '../engine/configurable-scheduling-engine';
import { nanoid } from 'nanoid';

describe('Integration Suite 13: Blackout Date Scheduling', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
	});

	afterEach(async () => {
		await clearAllTestData(db);
		await cleanupTestDatabase(db);
	});

	/**
	 * Helper to create blackout dates directly
	 */
	async function createBlackoutDate(date: string, reason?: string): Promise<string> {
		const id = nanoid();
		await db
			.insertInto('blackout_dates')
			.values({
				id,
				date,
				reason: reason || 'Test blackout',
			})
			.execute();
		return id;
	}

	/**
	 * Helper to create multiple blackout dates
	 */
	async function createBlackoutDatesFromArray(dates: string[], reason?: string): Promise<string[]> {
		const ids: string[] = [];
		for (const date of dates) {
			const id = await createBlackoutDate(date, reason);
			ids.push(id);
		}
		return ids;
	}

	describe('Test 1: Single blackout date is skipped', () => {
		it('should not schedule on a single blackout date', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 7 days (Dec 1-7)
			const dates = generateDateRange('2025-12-01', 7);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create a blackout on Dec 3
			await createBlackoutDate('2025-12-03', 'Holiday');

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Verify no assignment on blackout date
			const blackoutAssignment = result.assignments.find(a => a.date === '2025-12-03');
			expect(blackoutAssignment).toBeUndefined();

			// Verify assignments exist on non-blackout dates
			const assignmentDates = result.assignments.map(a => a.date);
			expect(assignmentDates).not.toContain('2025-12-03');
		});
	});

	describe('Test 2: Multiple blackout dates are skipped', () => {
		it('should not schedule on any blackout dates', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 10 days (Dec 1-10)
			const dates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create multiple blackout dates
			await createBlackoutDatesFromArray(
				['2025-12-03', '2025-12-05', '2025-12-07'],
				'Holiday'
			);

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Verify no assignments on any blackout dates
			const assignmentDates = result.assignments.map(a => a.date);
			expect(assignmentDates).not.toContain('2025-12-03');
			expect(assignmentDates).not.toContain('2025-12-05');
			expect(assignmentDates).not.toContain('2025-12-07');
		});
	});

	describe('Test 3: Blackout dates reduce available scheduling days', () => {
		it('should schedule available days even when blackouts reduce total below requirement', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 3 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create blackout on 2 of those days - leaving only 3 available (exactly enough)
			await createBlackoutDatesFromArray(['2025-12-02', '2025-12-04'], 'Holiday');

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			// Should have exactly 3 assignments (meeting the 3-day requirement)
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(3);

			// Verify no assignments on blackout dates
			const assignmentDates = result.assignments.map(a => a.date);
			expect(assignmentDates).not.toContain('2025-12-02');
			expect(assignmentDates).not.toContain('2025-12-04');

			// Verify assignments are on the available non-blackout days
			expect(assignmentDates).toContain('2025-12-01');
			expect(assignmentDates).toContain('2025-12-03');
			expect(assignmentDates).toContain('2025-12-05');
		});
	});

	describe('Test 4: Blackout date at start of range', () => {
		it('should skip blackout at the start of scheduling range', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 3 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Blackout on the first day
			await createBlackoutDate('2025-12-01', 'New Year observed');

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(3);

			// First assignment should be on Dec 2, not Dec 1
			const assignmentDates = result.assignments.map(a => a.date).sort();
			expect(assignmentDates[0]).toBe('2025-12-02');
			expect(assignmentDates).not.toContain('2025-12-01');
		});
	});

	describe('Test 5: Blackout date at end of range', () => {
		it('should skip blackout at the end of scheduling range', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 3 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Blackout on the last available day
			await createBlackoutDate('2025-12-05', 'Holiday');

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-05',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(3);

			const assignmentDates = result.assignments.map(a => a.date);
			expect(assignmentDates).not.toContain('2025-12-05');
		});
	});

	describe('Test 6: Consecutive blackout dates (holiday week)', () => {
		it('should skip entire consecutive blackout period', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 14 days
			const dates = generateDateRange('2025-12-15', 14);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Christmas week blackout (Dec 24-26)
			await createBlackoutDatesFromArray(
				['2025-12-24', '2025-12-25', '2025-12-26'],
				'Christmas holiday'
			);

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-15',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// Verify no assignments during Christmas week
			const assignmentDates = result.assignments.map(a => a.date);
			expect(assignmentDates).not.toContain('2025-12-24');
			expect(assignmentDates).not.toContain('2025-12-25');
			expect(assignmentDates).not.toContain('2025-12-26');
		});
	});

	describe('Test 7: Multiple students with blackout dates', () => {
		it('should respect blackouts for all students', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 3 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
				maxStudents: 2, // Can handle 2 students per day
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 2);

			// Create availability for 10 days
			const dates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Blackout dates
			await createBlackoutDatesFromArray(['2025-12-03', '2025-12-06'], 'Holidays');

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);

			// Both students should have assignments
			const student1Assignments = result.assignments.filter(a => a.studentId === studentIds[0]);
			const student2Assignments = result.assignments.filter(a => a.studentId === studentIds[1]);

			expect(student1Assignments.length).toBe(3);
			expect(student2Assignments.length).toBe(3);

			// Neither student should have assignments on blackout dates
			const allAssignmentDates = result.assignments.map(a => a.date);
			expect(allAssignmentDates).not.toContain('2025-12-03');
			expect(allAssignmentDates).not.toContain('2025-12-06');
		});
	});

	describe('Test 8: Blackout with different reasons stored correctly', () => {
		it('should store and retrieve blackout reasons', async () => {
			// Create blackout dates with different reasons
			await createBlackoutDate('2025-12-25', 'Christmas Day');
			await createBlackoutDate('2025-01-01', 'New Year\'s Day');
			await createBlackoutDate('2025-07-04', 'Independence Day');

			// Verify stored correctly
			const blackouts = await db
				.selectFrom('blackout_dates')
				.selectAll()
				.orderBy('date', 'asc')
				.execute();

			expect(blackouts).toHaveLength(3);
			expect(blackouts[0].reason).toBe('New Year\'s Day');
			expect(blackouts[1].reason).toBe('Independence Day');
			expect(blackouts[2].reason).toBe('Christmas Day');
		});
	});

	describe('Test 9: Assignments persisted correctly exclude blackouts', () => {
		it('should persist assignments without any on blackout dates', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			const dates = generateDateRange('2025-12-01', 10);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Multiple blackout dates
			await createBlackoutDatesFromArray(['2025-12-03', '2025-12-05', '2025-12-07'], 'Holidays');

			const engine = new ConfigurableSchedulingEngine(db);
			await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			// Query persisted assignments directly from database
			const persistedAssignments = await getStudentAssignments(db, studentIds[0]);

			expect(persistedAssignments.length).toBe(5);

			// Verify persisted assignments don't include blackout dates
			const persistedDates = persistedAssignments.map(a => a.date);
			expect(persistedDates).not.toContain('2025-12-03');
			expect(persistedDates).not.toContain('2025-12-05');
			expect(persistedDates).not.toContain('2025-12-07');
		});
	});

	describe('Test 10: No blackout dates allows normal scheduling', () => {
		it('should schedule normally when no blackout dates exist', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for exactly 5 days
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// No blackout dates created

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);

			// All 5 consecutive days should be scheduled
			const assignmentDates = result.assignments.map(a => a.date).sort();
			expect(assignmentDates).toEqual([
				'2025-12-01',
				'2025-12-02',
				'2025-12-03',
				'2025-12-04',
				'2025-12-05',
			]);
		});
	});

	describe('Test 11: Blackout outside scheduling range has no effect', () => {
		it('should ignore blackout dates outside the scheduling window', async () => {
			const { healthSystemId, siteIds: [siteId] } = await createTestHealthSystem(db, 'Hospital', 1);
			const clerkshipId = await createTestClerkship(db, 'Family Medicine', 'outpatient', { requiredDays: 5 });

			const preceptorId = await createTestPreceptor(db, {
				name: 'Dr. Test',
				healthSystemId,
				siteId,
			});

			await createTestTeam(db, clerkshipId, 'Test Team', [preceptorId]);

			const studentIds = await createTestStudents(db, 1);

			// Create availability for 5 days in December
			const dates = generateDateRange('2025-12-01', 5);
			await createPreceptorAvailability(db, preceptorId, siteId, dates);

			// Create blackout dates outside the scheduling window (January)
			await createBlackoutDatesFromArray(
				['2026-01-01', '2026-01-02'],
				'Future holidays'
			);

			const engine = new ConfigurableSchedulingEngine(db);
			const result = await engine.schedule(studentIds, [clerkshipId], {
				startDate: '2025-12-01',
				endDate: '2025-12-31',
			});

			// Should schedule normally since blackouts are in January
			expect(result.success).toBe(true);
			expect(result.assignments.length).toBe(5);
		});
	});
});
