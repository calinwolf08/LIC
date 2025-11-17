/**
 * Scheduling Algorithm Integration Tests
 *
 * Comprehensive tests for the scheduling engine with various constraint scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingEngine } from './scheduling-engine';
import {
	NoDoubleBookingConstraint,
	PreceptorCapacityConstraint,
	SpecialtyMatchConstraint,
	BlackoutDateConstraint,
	PreceptorAvailabilityConstraint
} from '../constraints';
import type {
	StudentsTable,
	PreceptorsTable,
	ClerkshipsTable,
	PreceptorAvailabilityTable
} from '$lib/db/types';

// Helper to create mock student
function createMockStudent(overrides: Partial<StudentsTable> = {}): StudentsTable {
	return {
		id: crypto.randomUUID(),
		name: 'Test Student',
		email: 'student@example.com',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

// Helper to create mock preceptor
function createMockPreceptor(overrides: Partial<PreceptorsTable> = {}): PreceptorsTable {
	return {
		id: crypto.randomUUID(),
		name: 'Dr. Test',
		email: 'preceptor@example.com',
		specialty: 'Family Medicine',
		max_students: 2,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

// Helper to create mock clerkship
function createMockClerkship(overrides: Partial<ClerkshipsTable> = {}): ClerkshipsTable {
	return {
		id: crypto.randomUUID(),
		name: 'Family Medicine Clerkship',
		specialty: 'Family Medicine',
		required_days: 5,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

// Helper to create availability records for a preceptor across a date range
function createAvailabilityForDateRange(
	preceptorId: string,
	startDate: string,
	endDate: string,
	isAvailable = true
): PreceptorAvailabilityTable[] {
	const availability: PreceptorAvailabilityTable[] = [];
	const start = new Date(startDate);
	const end = new Date(endDate);

	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().split('T')[0];
		availability.push({
			id: crypto.randomUUID(),
			preceptor_id: preceptorId,
			date: dateStr,
			is_available: isAvailable ? 1 : 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});
	}

	return availability;
}

describe('Scheduling Algorithm Integration Tests', () => {
	let engine: SchedulingEngine;
	let engineWithAvailability: SchedulingEngine;

	beforeEach(() => {
		// Create engine WITHOUT availability constraint for basic tests
		// (availability constraint requires explicit records, which we test separately)
		const basicConstraints = [
			new NoDoubleBookingConstraint(),
			new PreceptorCapacityConstraint(),
			new SpecialtyMatchConstraint(),
			new BlackoutDateConstraint()
		];
		engine = new SchedulingEngine(basicConstraints);

		// Create engine WITH availability constraint for availability-specific tests
		const allConstraints = [
			new NoDoubleBookingConstraint(),
			new PreceptorCapacityConstraint(),
			new SpecialtyMatchConstraint(),
			new BlackoutDateConstraint(),
			new PreceptorAvailabilityConstraint()
		];
		engineWithAvailability = new SchedulingEngine(allConstraints);
	});

	describe('Basic Scheduling Scenarios', () => {
		it('schedules single student with single preceptor successfully', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 3 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-05');

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				[], // no blackout dates
				availability,
				'2024-01-01',
				'2024-01-05'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(3);
			expect(result.unmetRequirements).toHaveLength(0);
			expect(result.assignments.every(a => a.studentId === 'student-1')).toBe(true);
			expect(result.assignments.every(a => a.preceptorId === 'preceptor-1')).toBe(true);
			expect(result.assignments.every(a => a.clerkshipId === 'clerkship-1')).toBe(true);
		});

		it('schedules multiple students across available preceptors', async () => {
			const student1 = createMockStudent({ id: 'student-1' });
			const student2 = createMockStudent({ id: 'student-2', email: 'student2@example.com' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', max_students: 2, specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-03');

			const result = await engine.generateSchedule(
				[student1, student2],
				[preceptor],
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(4); // 2 students * 2 days each
			const student1Assignments = result.assignments.filter(a => a.studentId === 'student-1');
			const student2Assignments = result.assignments.filter(a => a.studentId === 'student-2');
			expect(student1Assignments).toHaveLength(2);
			expect(student2Assignments).toHaveLength(2);
		});

		it('respects preceptor capacity constraints', async () => {
			const student1 = createMockStudent({ id: 'student-1' });
			const student2 = createMockStudent({ id: 'student-2', email: 'student2@example.com' });
			const student3 = createMockStudent({ id: 'student-3', email: 'student3@example.com' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', max_students: 2, specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 1 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-01');

			const result = await engine.generateSchedule(
				[student1, student2, student3],
				[preceptor],
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-01' // single day
			);

			// Should only assign 2 students due to capacity
			expect(result.assignments).toHaveLength(2);
			expect(result.success).toBe(false); // One student unmet
			expect(result.unmetRequirements).toHaveLength(1);
		});

		it('handles no-double-booking constraint', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor1 = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const preceptor2 = createMockPreceptor({ id: 'preceptor-2', email: 'preceptor2@example.com', specialty: 'Internal Medicine' });
			const clerkship1 = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 1 });
			const clerkship2 = createMockClerkship({ id: 'clerkship-2', name: 'Internal Medicine', specialty: 'Internal Medicine', required_days: 1 });

			// Create availability for both preceptors
			const availability = [
				...createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-01'),
				...createAvailabilityForDateRange('preceptor-2', '2024-01-01', '2024-01-01')
			];

			const result = await engine.generateSchedule(
				[student],
				[preceptor1, preceptor2],
				[clerkship1, clerkship2],
				[],
				availability,
				'2024-01-01',
				'2024-01-01' // single day - can only do one assignment
			);

			// Student can only be assigned once per day
			expect(result.assignments).toHaveLength(1);
		});
	});

	describe('Specialty Matching', () => {
		it('only assigns students to preceptors with matching specialty', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const familyPreceptor = createMockPreceptor({ id: 'preceptor-fm', specialty: 'Family Medicine' });
			const imPreceptor = createMockPreceptor({ id: 'preceptor-im', email: 'im@example.com', specialty: 'Internal Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			// Create availability for both preceptors
			const availability = [
				...createAvailabilityForDateRange('preceptor-fm', '2024-01-01', '2024-01-03'),
				...createAvailabilityForDateRange('preceptor-im', '2024-01-01', '2024-01-03')
			];

			const result = await engine.generateSchedule(
				[student],
				[familyPreceptor, imPreceptor],
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(true);
			// All assignments should be with Family Medicine preceptor
			expect(result.assignments.every(a => a.preceptorId === 'preceptor-fm')).toBe(true);
		});

		it('fails when no preceptors match required specialty', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Internal Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				[],
				[],
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(false);
			expect(result.assignments).toHaveLength(0);
			expect(result.unmetRequirements).toHaveLength(1);
		});
	});

	describe('Blackout Dates', () => {
		it('skips blackout dates when scheduling', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-03');

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				['2024-01-02'], // blackout on middle day
				availability,
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(2);
			// Should assign on Jan 1 and Jan 3, skipping Jan 2
			expect(result.assignments.some(a => a.date === '2024-01-02')).toBe(false);
			expect(result.assignments.some(a => a.date === '2024-01-01')).toBe(true);
			expect(result.assignments.some(a => a.date === '2024-01-03')).toBe(true);
		});

		it('handles multiple blackout dates', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 3 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-05');

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				['2024-01-02', '2024-01-04'], // blackout on day 2 and 4
				availability,
				'2024-01-01',
				'2024-01-05'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(3);
			// Should only assign on days 1, 3, and 5
			const dates = result.assignments.map(a => a.date).sort();
			expect(dates).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
		});
	});

	describe('Preceptor Availability', () => {
		it('respects preceptor unavailability', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			// Mark preceptor available on Jan 1 and 3, but NOT on Jan 2
			const availability: PreceptorAvailabilityTable[] = [
				{
					id: crypto.randomUUID(),
					preceptor_id: 'preceptor-1',
					date: '2024-01-01',
					is_available: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				},
				{
					id: crypto.randomUUID(),
					preceptor_id: 'preceptor-1',
					date: '2024-01-03',
					is_available: 1,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
			];

			const result = await engineWithAvailability.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(2);
			// Should not assign on Jan 2 when preceptor is unavailable
			expect(result.assignments.some(a => a.date === '2024-01-02')).toBe(false);
		});
	});

	describe('Multiple Clerkships', () => {
		it('distributes student assignments across multiple clerkships', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const fmPreceptor = createMockPreceptor({ id: 'preceptor-fm', specialty: 'Family Medicine' });
			const imPreceptor = createMockPreceptor({ id: 'preceptor-im', email: 'im@example.com', specialty: 'Internal Medicine' });
			const fmClerkship = createMockClerkship({ id: 'clerkship-fm', specialty: 'Family Medicine', required_days: 2 });
			const imClerkship = createMockClerkship({ id: 'clerkship-im', name: 'Internal Medicine', specialty: 'Internal Medicine', required_days: 2 });

			// Create availability for both preceptors
			const availability = [
				...createAvailabilityForDateRange('preceptor-fm', '2024-01-01', '2024-01-10'),
				...createAvailabilityForDateRange('preceptor-im', '2024-01-01', '2024-01-10')
			];

			const result = await engine.generateSchedule(
				[student],
				[fmPreceptor, imPreceptor],
				[fmClerkship, imClerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-10'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(4);

			const fmAssignments = result.assignments.filter(a => a.clerkshipId === 'clerkship-fm');
			const imAssignments = result.assignments.filter(a => a.clerkshipId === 'clerkship-im');

			expect(fmAssignments).toHaveLength(2);
			expect(imAssignments).toHaveLength(2);
		});
	});

	describe('Edge Cases and Constraints', () => {
		it('handles scenario with no available preceptors', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			const result = await engine.generateSchedule(
				[student],
				[], // no preceptors
				[clerkship],
				[],
				[],
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(false);
			expect(result.assignments).toHaveLength(0);
			expect(result.unmetRequirements).toHaveLength(1);
		});

		it('handles scenario with insufficient time period', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 10 });

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				[],
				[],
				'2024-01-01',
				'2024-01-05' // only 5 days, need 10
			);

			expect(result.success).toBe(false);
			expect(result.assignments.length).toBeLessThan(10);
			expect(result.unmetRequirements).toHaveLength(1);
		});

		it('reports unmet requirements when constraints cannot be satisfied', async () => {
			const student1 = createMockStudent({ id: 'student-1' });
			const student2 = createMockStudent({ id: 'student-2', email: 'student2@example.com' });
			const student3 = createMockStudent({ id: 'student-3', email: 'student3@example.com' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', max_students: 1, specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 1 });

			// Create availability for preceptor
			const availability = createAvailabilityForDateRange('preceptor-1', '2024-01-01', '2024-01-01');

			const result = await engine.generateSchedule(
				[student1, student2, student3],
				[preceptor],
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-01'
			);

			// Should complete but with unmet requirements (can only schedule 1 student due to capacity)
			expect(result.success).toBe(false);
			expect(result.assignments).toHaveLength(1);
			expect(result.unmetRequirements).toHaveLength(2);
		});

		it('handles empty student list', async () => {
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 5 });

			const result = await engine.generateSchedule(
				[], // no students
				[preceptor],
				[clerkship],
				[],
				[],
				'2024-01-01',
				'2024-01-10'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(0);
			expect(result.unmetRequirements).toHaveLength(0);
		});

		it('handles scenario where all days are blacked out', async () => {
			const student = createMockStudent({ id: 'student-1' });
			const preceptor = createMockPreceptor({ id: 'preceptor-1', specialty: 'Family Medicine' });
			const clerkship = createMockClerkship({ id: 'clerkship-1', specialty: 'Family Medicine', required_days: 2 });

			const result = await engine.generateSchedule(
				[student],
				[preceptor],
				[clerkship],
				['2024-01-01', '2024-01-02', '2024-01-03'], // all days blacked out
				[],
				'2024-01-01',
				'2024-01-03'
			);

			expect(result.success).toBe(false);
			expect(result.assignments).toHaveLength(0);
			expect(result.unmetRequirements).toHaveLength(1);
		});
	});

	describe('Fair Distribution', () => {
		it('attempts to distribute students fairly across preceptors', async () => {
			const students = [
				createMockStudent({ id: 's1', email: 's1@example.com' }),
				createMockStudent({ id: 's2', email: 's2@example.com' }),
				createMockStudent({ id: 's3', email: 's3@example.com' }),
				createMockStudent({ id: 's4', email: 's4@example.com' })
			];
			const preceptors = [
				createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 2 }),
				createMockPreceptor({ id: 'p2', email: 'p2@example.com', specialty: 'Family Medicine', max_students: 2 })
			];
			const clerkship = createMockClerkship({ id: 'c1', specialty: 'Family Medicine', required_days: 2 });

			// Create availability for both preceptors
			const availability = [
				...createAvailabilityForDateRange('p1', '2024-01-01', '2024-01-10'),
				...createAvailabilityForDateRange('p2', '2024-01-01', '2024-01-10')
			];

			const result = await engine.generateSchedule(
				students,
				preceptors,
				[clerkship],
				[],
				availability,
				'2024-01-01',
				'2024-01-10'
			);

			expect(result.success).toBe(true);
			expect(result.assignments).toHaveLength(8); // 4 students * 2 days

			// Check distribution
			const p1Assignments = result.assignments.filter(a => a.preceptorId === 'p1').length;
			const p2Assignments = result.assignments.filter(a => a.preceptorId === 'p2').length;

			// Both preceptors should have assignments (fair distribution)
			expect(p1Assignments).toBeGreaterThan(0);
			expect(p2Assignments).toBeGreaterThan(0);
		});
	});
});
