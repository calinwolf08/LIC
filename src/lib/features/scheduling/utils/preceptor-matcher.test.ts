/**
 * Preceptor Matcher Unit Tests
 *
 * Tests for preceptor matching and filtering utilities
 */

import { describe, it, expect } from 'vitest';
import { getAvailablePreceptors, getPreceptorsForClerkship } from './preceptor-matcher';
import type { SchedulingContext, Assignment } from '../types';
import type { Students, Preceptors, Clerkships } from '$lib/db/types';

function createMockContext(
	preceptors: Preceptors[] = [],
	clerkships: Clerkships[] = [],
	assignments: Assignment[] = []
): SchedulingContext {
	const assignmentsByDate = new Map<string, Assignment[]>();
	const assignmentsByStudent = new Map<string, Assignment[]>();
	const assignmentsByPreceptor = new Map<string, Assignment[]>();

	for (const assignment of assignments) {
		// By date
		if (!assignmentsByDate.has(assignment.date)) {
			assignmentsByDate.set(assignment.date, []);
		}
		assignmentsByDate.get(assignment.date)!.push(assignment);

		// By student
		if (!assignmentsByStudent.has(assignment.studentId)) {
			assignmentsByStudent.set(assignment.studentId, []);
		}
		assignmentsByStudent.get(assignment.studentId)!.push(assignment);

		// By preceptor
		if (!assignmentsByPreceptor.has(assignment.preceptorId)) {
			assignmentsByPreceptor.set(assignment.preceptorId, []);
		}
		assignmentsByPreceptor.get(assignment.preceptorId)!.push(assignment);
	}

	return {
		students: [],
		preceptors,
		clerkships,
		assignments,
		assignmentsByDate,
		assignmentsByStudent,
		assignmentsByPreceptor,
		studentRequirements: new Map(),
		blackoutDates: new Set(),
		preceptorAvailability: new Map()
	};
}

function createMockPreceptor(overrides: Partial<Preceptors> = {}): Preceptors {
	return {
		id: crypto.randomUUID(),
		name: 'Dr. Test',
		email: 'test@example.com',
		specialty: 'Family Medicine',
		max_students: 2,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

function createMockClerkship(overrides: Partial<Clerkships> = {}): Clerkships {
	return {
		id: crypto.randomUUID(),
		name: 'Test Clerkship',
		specialty: 'Family Medicine',
		required_days: 5,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

describe('getPreceptorsForClerkship()', () => {
	it('returns preceptors with matching specialty', () => {
		const fmPreceptor1 = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine' });
		const fmPreceptor2 = createMockPreceptor({ id: 'p2', specialty: 'Family Medicine' });
		const imPreceptor = createMockPreceptor({ id: 'p3', specialty: 'Internal Medicine' });

		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([fmPreceptor1, fmPreceptor2, imPreceptor], [clerkship]);

		const result = getPreceptorsForClerkship(clerkship, context);

		expect(result).toHaveLength(2);
		expect(result.map((p) => p.id)).toContain('p1');
		expect(result.map((p) => p.id)).toContain('p2');
		expect(result.map((p) => p.id)).not.toContain('p3');
	});

	it('returns empty array when no matching specialty', () => {
		const preceptor = createMockPreceptor({ specialty: 'Surgery' });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		const result = getPreceptorsForClerkship(clerkship, context);

		expect(result).toEqual([]);
	});

	it('returns all preceptors when all match specialty', () => {
		const preceptors = [
			createMockPreceptor({ id: 'p1', specialty: 'Family Medicine' }),
			createMockPreceptor({ id: 'p2', specialty: 'Family Medicine' }),
			createMockPreceptor({ id: 'p3', specialty: 'Family Medicine' })
		];
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext(preceptors, [clerkship]);

		const result = getPreceptorsForClerkship(clerkship, context);

		expect(result).toHaveLength(3);
	});

	it('handles empty preceptor list', () => {
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([], [clerkship]);

		const result = getPreceptorsForClerkship(clerkship, context);

		expect(result).toEqual([]);
	});

	it('is case-sensitive for specialty matching', () => {
		const preceptor = createMockPreceptor({ specialty: 'family medicine' });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		const result = getPreceptorsForClerkship(clerkship, context);

		expect(result).toEqual([]);
	});
});

describe('getAvailablePreceptors()', () => {
	it('returns preceptors with matching specialty, availability, and capacity', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 2 });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		// Add availability for the date
		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p1');
	});

	it('excludes preceptors with non-matching specialty', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Internal Medicine' });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toEqual([]);
	});

	it('excludes preceptors not available on the date', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine' });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		// Preceptor available on different date
		context.preceptorAvailability.set('p1', new Set(['2024-01-16']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toEqual([]);
	});

	it('excludes preceptors with no availability records', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine' });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([preceptor], [clerkship]);

		// No availability set for this preceptor
		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toEqual([]);
	});

	it('excludes preceptors at capacity', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 1 });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });

		// Already has one assignment on this date
		const assignments: Assignment[] = [
			{
				studentId: 's1',
				preceptorId: 'p1',
				clerkshipId: 'c1',
				date: '2024-01-15'
			}
		];

		const context = createMockContext([preceptor], [clerkship], assignments);
		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toEqual([]);
	});

	it('includes preceptors below capacity', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 2 });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });

		// Has one assignment, capacity is 2
		const assignments: Assignment[] = [
			{
				studentId: 's1',
				preceptorId: 'p1',
				clerkshipId: 'c1',
				date: '2024-01-15'
			}
		];

		const context = createMockContext([preceptor], [clerkship], assignments);
		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p1');
	});

	it('filters multiple preceptors correctly', () => {
		const p1 = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 1 });
		const p2 = createMockPreceptor({ id: 'p2', specialty: 'Family Medicine', max_students: 2 });
		const p3 = createMockPreceptor({ id: 'p3', specialty: 'Internal Medicine', max_students: 2 });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });

		// p1 is at capacity
		const assignments: Assignment[] = [
			{
				studentId: 's1',
				preceptorId: 'p1',
				clerkshipId: 'c1',
				date: '2024-01-15'
			}
		];

		const context = createMockContext([p1, p2, p3], [clerkship], assignments);

		// All available on the date
		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));
		context.preceptorAvailability.set('p2', new Set(['2024-01-15']));
		context.preceptorAvailability.set('p3', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		// Should only return p2 (p1 at capacity, p3 wrong specialty)
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p2');
	});

	it('handles assignments on different dates correctly', () => {
		const preceptor = createMockPreceptor({ id: 'p1', specialty: 'Family Medicine', max_students: 1 });
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });

		// Has assignment on different date
		const assignments: Assignment[] = [
			{
				studentId: 's1',
				preceptorId: 'p1',
				clerkshipId: 'c1',
				date: '2024-01-16'
			}
		];

		const context = createMockContext([preceptor], [clerkship], assignments);
		context.preceptorAvailability.set('p1', new Set(['2024-01-15', '2024-01-16']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		// Should be available on 2024-01-15 (assignment is on different date)
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p1');
	});

	it('handles empty preceptor list', () => {
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext([], [clerkship]);

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toEqual([]);
	});

	it('returns preceptors in original order', () => {
		const preceptors = [
			createMockPreceptor({ id: 'p1', name: 'Dr. A', specialty: 'Family Medicine' }),
			createMockPreceptor({ id: 'p2', name: 'Dr. B', specialty: 'Family Medicine' }),
			createMockPreceptor({ id: 'p3', name: 'Dr. C', specialty: 'Family Medicine' })
		];
		const clerkship = createMockClerkship({ specialty: 'Family Medicine' });
		const context = createMockContext(preceptors, [clerkship]);

		context.preceptorAvailability.set('p1', new Set(['2024-01-15']));
		context.preceptorAvailability.set('p2', new Set(['2024-01-15']));
		context.preceptorAvailability.set('p3', new Set(['2024-01-15']));

		const result = getAvailablePreceptors(clerkship, '2024-01-15', context);

		expect(result).toHaveLength(3);
		expect(result[0].name).toBe('Dr. A');
		expect(result[1].name).toBe('Dr. B');
		expect(result[2].name).toBe('Dr. C');
	});
});
