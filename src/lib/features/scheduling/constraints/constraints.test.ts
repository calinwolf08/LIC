// @ts-nocheck
/**
 * Scheduling Constraints Unit Tests
 *
 * Tests for individual constraint implementations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NoDoubleBookingConstraint } from './no-double-booking.constraint';
import { PreceptorCapacityConstraint } from './preceptor-capacity.constraint';
import { SpecialtyMatchConstraint } from './specialty-match.constraint';
import { BlackoutDateConstraint } from './blackout-date.constraint';
import { PreceptorAvailabilityConstraint } from './preceptor-availability.constraint';
import { ViolationTracker } from '../services/violation-tracker';
import type { Assignment, SchedulingContext } from '../types';
import type { Students, Preceptors, Clerkships } from '$lib/db/types';

describe('NoDoubleBookingConstraint', () => {
	let constraint: NoDoubleBookingConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new NoDoubleBookingConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor1: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor2: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student],
			preceptors: [preceptor1, preceptor2],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 5]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('NoDoubleBooking');
		expect(constraint.priority).toBe(1);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows assignment when student has no other assignments on that date', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when student is already assigned on that date', () => {
		// Create existing assignment
		const existingAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(existingAssignment);
		context.assignmentsByDate.set('2024-01-15', [existingAssignment]);

		// Try to assign same student on same date to different preceptor
		const newAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(newAssignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('records violation with correct metadata', () => {
		const existingAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(existingAssignment);
		context.assignmentsByDate.set('2024-01-15', [existingAssignment]);

		const newAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		constraint.validate(newAssignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0].constraintName).toBe('NoDoubleBooking');
		expect(violations[0].metadata).toHaveProperty('studentName', 'John Doe');
		expect(violations[0].metadata).toHaveProperty('date', '2024-01-15');
		expect(violations[0].metadata).toHaveProperty('conflictingPreceptorId', 'preceptor-1');
		expect(violations[0].metadata).toHaveProperty('conflictingPreceptorName', 'Dr. Smith');
	});

	it('generates correct violation message', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const message = constraint.getViolationMessage(assignment, context);
		expect(message).toBe('Student John Doe is already assigned on 2024-01-15');
	});

	it('allows student to be assigned on different dates', () => {
		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(assignment1);
		context.assignmentsByDate.set('2024-01-15', [assignment1]);

		const assignment2: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(assignment2, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('PreceptorCapacityConstraint', () => {
	let constraint: PreceptorCapacityConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new PreceptorCapacityConstraint();
		tracker = new ViolationTracker();

		const student1: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: Students = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student1, student2],
			preceptors: [preceptor],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 5]])],
				['student-2', new Map([['clerkship-1', 5]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('PreceptorCapacity');
		expect(constraint.priority).toBe(2);
		expect(constraint.bypassable).toBe(true);
	});

	it('allows assignment when preceptor is under capacity', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when preceptor is at capacity', () => {
		// Fill preceptor's capacity
		const existingAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(existingAssignment);
		context.assignmentsByDate.set('2024-01-15', [existingAssignment]);

		// Try to assign another student to same preceptor on same date
		const newAssignment: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(newAssignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('allows assignment when preceptor has higher capacity', () => {
		// Change preceptor capacity to 2
		context.preceptors[0].max_students = 2;

		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(assignment1);
		context.assignmentsByDate.set('2024-01-15', [assignment1]);

		const assignment2: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment2, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('records violation with correct metadata', () => {
		const existingAssignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(existingAssignment);
		context.assignmentsByDate.set('2024-01-15', [existingAssignment]);

		const newAssignment: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		constraint.validate(newAssignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0].constraintName).toBe('PreceptorCapacity');
		expect(violations[0].metadata).toHaveProperty('preceptorName', 'Dr. Smith');
		expect(violations[0].metadata).toHaveProperty('preceptorId', 'preceptor-1');
		expect(violations[0].metadata).toHaveProperty('studentName', 'Jane Smith');
		expect(violations[0].metadata).toHaveProperty('date', '2024-01-15');
		expect(violations[0].metadata).toHaveProperty('currentCapacity', 1);
		expect(violations[0].metadata).toHaveProperty('maxCapacity', 1);
		expect(violations[0].metadata).toHaveProperty('studentsAlreadyAssigned');
	});

	it('generates correct violation message', () => {
		const assignment: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const message = constraint.getViolationMessage(assignment, context);
		expect(message).toBe('Preceptor Dr. Smith is at capacity (1) on 2024-01-15');
	});

	it('returns false when preceptor not found', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'nonexistent-preceptor',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
	});

	it('allows same preceptor on different dates', () => {
		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		context.assignments.push(assignment1);
		context.assignmentsByDate.set('2024-01-15', [assignment1]);

		const assignment2: Assignment = {
			studentId: 'student-2',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result = constraint.validate(assignment2, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('SpecialtyMatchConstraint', () => {
	let constraint: SpecialtyMatchConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new SpecialtyMatchConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const familyMedicinePreceptor: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const internalMedicinePreceptor: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Internal Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const familyMedicineClerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const internalMedicineClerkship: Clerkships = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student],
			preceptors: [familyMedicinePreceptor, internalMedicinePreceptor],
			clerkships: [familyMedicineClerkship, internalMedicineClerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				[
					'student-1',
					new Map([
						['clerkship-1', 5],
						['clerkship-2', 5]
					])
				]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('SpecialtyMatch');
		expect(constraint.priority).toBe(1);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows assignment when preceptor specialty matches clerkship', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when preceptor specialty does not match clerkship', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1', // Family Medicine
			clerkshipId: 'clerkship-2', // Internal Medicine
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('records violation with correct metadata', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-2',
			date: '2024-01-15'
		};

		constraint.validate(assignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0].constraintName).toBe('SpecialtyMatch');
		expect(violations[0].metadata).toHaveProperty('preceptorName', 'Dr. Smith');
		expect(violations[0].metadata).toHaveProperty('preceptorSpecialty', 'Family Medicine');
		expect(violations[0].metadata).toHaveProperty('clerkshipName', 'IM Clerkship');
		expect(violations[0].metadata).toHaveProperty('clerkshipSpecialty', 'Internal Medicine');
		expect(violations[0].metadata).toHaveProperty('studentName', 'John Doe');
		expect(violations[0].metadata).toHaveProperty('date', '2024-01-15');
	});

	it('generates correct violation message', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-2',
			date: '2024-01-15'
		};

		const message = constraint.getViolationMessage(assignment, context);
		expect(message).toBe(
			'Preceptor Dr. Smith (Family Medicine) cannot teach IM Clerkship (requires Internal Medicine)'
		);
	});

	it('returns false when preceptor not found', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'nonexistent-preceptor',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
	});

	it('returns false when clerkship not found', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'nonexistent-clerkship',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
	});

	it('allows different preceptors with same specialty', () => {
		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result1 = constraint.validate(assignment1, context, tracker);
		expect(result1).toBe(true);

		// Add another Family Medicine preceptor
		const anotherFMPreceptor: Preceptors = {
			id: 'preceptor-3',
			name: 'Dr. Brown',
			email: 'brown@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};
		context.preceptors.push(anotherFMPreceptor);

		const assignment2: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-3',
			clerkshipId: 'clerkship-1',
			date: '2024-01-16'
		};

		const result2 = constraint.validate(assignment2, context, tracker);
		expect(result2).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});

describe('BlackoutDateConstraint', () => {
	let constraint: BlackoutDateConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new BlackoutDateConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student],
			preceptors: [preceptor],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 5]])]]),
			blackoutDates: new Set(['2024-12-25', '2024-01-01']),
			preceptorAvailability: new Map()
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('BlackoutDate');
		expect(constraint.priority).toBe(1);
		expect(constraint.bypassable).toBe(false);
	});

	it('allows assignment on non-blackout date', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment on blackout date', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-12-25'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('records violation with correct metadata', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-12-25'
		};

		constraint.validate(assignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0].constraintName).toBe('BlackoutDate');
		expect(violations[0].metadata).toHaveProperty('date', '2024-12-25');
		expect(violations[0].metadata).toHaveProperty('studentName', 'John Doe');
	});

	it('generates correct violation message', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-12-25'
		};

		const message = constraint.getViolationMessage(assignment, context);
		expect(message).toBe('2024-12-25 is a blackout date (system-wide closure)');
	});

	it('allows assignment when no blackout dates exist', () => {
		context.blackoutDates.clear();

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-12-25'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks multiple different blackout dates', () => {
		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-12-25'
		};

		const assignment2: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-01'
		};

		const result1 = constraint.validate(assignment1, context, tracker);
		const result2 = constraint.validate(assignment2, context, tracker);

		expect(result1).toBe(false);
		expect(result2).toBe(false);
		expect(tracker.getTotalViolations()).toBe(2);
	});
});

describe('PreceptorAvailabilityConstraint', () => {
	let constraint: PreceptorAvailabilityConstraint;
	let tracker: ViolationTracker;
	let context: SchedulingContext;

	beforeEach(() => {
		constraint = new PreceptorAvailabilityConstraint();
		tracker = new ViolationTracker();

		const student: Students = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const preceptor: Preceptors = {
			id: 'preceptor-1',
			name: 'Dr. Smith',
			email: 'smith@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: Clerkships = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context = {
			students: [student],
			preceptors: [preceptor],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([['student-1', new Map([['clerkship-1', 5]])]]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map([
				['preceptor-1', new Set(['2024-01-15', '2024-01-16', '2024-01-17'])]
			])
		};
	});

	it('has correct properties', () => {
		expect(constraint.name).toBe('PreceptorAvailability');
		expect(constraint.priority).toBe(1);
		expect(constraint.bypassable).toBe(true);
	});

	it('allows assignment when preceptor is available', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('blocks assignment when preceptor is not available', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-20'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('blocks assignment when preceptor has no availability records', () => {
		context.preceptorAvailability.clear();

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const result = constraint.validate(assignment, context, tracker);

		expect(result).toBe(false);
		expect(tracker.getTotalViolations()).toBe(1);
	});

	it('records violation with correct metadata', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-20'
		};

		constraint.validate(assignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations).toHaveLength(1);
		expect(violations[0].constraintName).toBe('PreceptorAvailability');
		expect(violations[0].metadata).toHaveProperty('preceptorName', 'Dr. Smith');
		expect(violations[0].metadata).toHaveProperty('preceptorId', 'preceptor-1');
		expect(violations[0].metadata).toHaveProperty('studentName', 'John Doe');
		expect(violations[0].metadata).toHaveProperty('clerkshipName', 'FM Clerkship');
		expect(violations[0].metadata).toHaveProperty('date', '2024-01-20');
		expect(violations[0].metadata).toHaveProperty('totalAvailableDates', 3);
	});

	it('generates correct violation message', () => {
		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-20'
		};

		const message = constraint.getViolationMessage(assignment, context);
		expect(message).toBe('Preceptor Dr. Smith is not available on 2024-01-20');
	});

	it('tracks total available dates in violation metadata', () => {
		context.preceptorAvailability.clear();

		const assignment: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		constraint.validate(assignment, context, tracker);

		const violations = tracker.exportViolations();
		expect(violations[0].metadata).toHaveProperty('totalAvailableDates', 0);
	});

	it('allows assignment on any available date', () => {
		const dates = ['2024-01-15', '2024-01-16', '2024-01-17'];

		for (const date of dates) {
			const assignment: Assignment = {
				studentId: 'student-1',
				preceptorId: 'preceptor-1',
				clerkshipId: 'clerkship-1',
				date
			};

			const result = constraint.validate(assignment, context, tracker);
			expect(result).toBe(true);
		}

		expect(tracker.getTotalViolations()).toBe(0);
	});

	it('allows different preceptors with different availability', () => {
		const preceptor2: Preceptors = {
			id: 'preceptor-2',
			name: 'Dr. Jones',
			email: 'jones@example.com',
			specialty: 'Family Medicine',
			max_students: 1,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		context.preceptors.push(preceptor2);
		context.preceptorAvailability.set('preceptor-2', new Set(['2024-01-20', '2024-01-21']));

		const assignment1: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-1',
			clerkshipId: 'clerkship-1',
			date: '2024-01-15'
		};

		const assignment2: Assignment = {
			studentId: 'student-1',
			preceptorId: 'preceptor-2',
			clerkshipId: 'clerkship-1',
			date: '2024-01-20'
		};

		const result1 = constraint.validate(assignment1, context, tracker);
		const result2 = constraint.validate(assignment2, context, tracker);

		expect(result1).toBe(true);
		expect(result2).toBe(true);
		expect(tracker.getTotalViolations()).toBe(0);
	});
});
