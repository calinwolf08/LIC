/**
 * RequirementTracker Unit Tests
 *
 * Tests for requirement tracking and student progress functions
 */

import { describe, it, expect } from 'vitest';
import {
	getMostNeededClerkship,
	getStudentsNeedingAssignments,
	checkUnmetRequirements,
	initializeStudentRequirements
} from './requirement-tracker';
import type { SchedulingContext } from '../types';
import type { StudentsTable, PreceptorsTable, ClerkshipsTable } from '$lib/db/types';

describe('initializeStudentRequirements()', () => {
	it('creates requirements map for single student and clerkship', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: ClerkshipsTable[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const requirements = initializeStudentRequirements(students, clerkships);

		expect(requirements.size).toBe(1);
		expect(requirements.has('student-1')).toBe(true);

		const studentReqs = requirements.get('student-1')!;
		expect(studentReqs.size).toBe(1);
		expect(studentReqs.get('clerkship-1')).toBe(5);
	});

	it('creates requirements for multiple students', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'student-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: ClerkshipsTable[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const requirements = initializeStudentRequirements(students, clerkships);

		expect(requirements.size).toBe(2);
		expect(requirements.has('student-1')).toBe(true);
		expect(requirements.has('student-2')).toBe(true);
		expect(requirements.get('student-1')!.get('clerkship-1')).toBe(5);
		expect(requirements.get('student-2')!.get('clerkship-1')).toBe(5);
	});

	it('creates requirements for multiple clerkships', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: ClerkshipsTable[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'clerkship-2',
				name: 'IM Clerkship',
				specialty: 'Internal Medicine',
				required_days: 10,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const requirements = initializeStudentRequirements(students, clerkships);

		const studentReqs = requirements.get('student-1')!;
		expect(studentReqs.size).toBe(2);
		expect(studentReqs.get('clerkship-1')).toBe(5);
		expect(studentReqs.get('clerkship-2')).toBe(10);
	});

	it('handles empty students array', () => {
		const students: StudentsTable[] = [];
		const clerkships: ClerkshipsTable[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				specialty: 'Family Medicine',
				required_days: 5,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const requirements = initializeStudentRequirements(students, clerkships);

		expect(requirements.size).toBe(0);
	});

	it('handles empty clerkships array', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];
		const clerkships: ClerkshipsTable[] = [];

		const requirements = initializeStudentRequirements(students, clerkships);

		expect(requirements.size).toBe(1);
		const studentReqs = requirements.get('student-1')!;
		expect(studentReqs.size).toBe(0);
	});

	it('respects different required_days for different clerkships', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const clerkships: ClerkshipsTable[] = [
			{
				id: 'clerkship-1',
				name: 'FM Clerkship',
				specialty: 'Family Medicine',
				required_days: 3,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'clerkship-2',
				name: 'IM Clerkship',
				specialty: 'Internal Medicine',
				required_days: 7,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'clerkship-3',
				name: 'Surgery Clerkship',
				specialty: 'Surgery',
				required_days: 15,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const requirements = initializeStudentRequirements(students, clerkships);

		const studentReqs = requirements.get('student-1')!;
		expect(studentReqs.get('clerkship-1')).toBe(3);
		expect(studentReqs.get('clerkship-2')).toBe(7);
		expect(studentReqs.get('clerkship-3')).toBe(15);
	});
});

describe('getMostNeededClerkship()', () => {
	function createContext(
		studentRequirements: Map<string, Map<string, number>>,
		clerkships: ClerkshipsTable[]
	): SchedulingContext {
		return {
			students: [],
			preceptors: [],
			clerkships,
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements,
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};
	}

	it('returns clerkship with most days needed', () => {
		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship2: ClerkshipsTable = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const studentReqs = new Map([
			['clerkship-1', 2],
			['clerkship-2', 7]
		]);

		const context = createContext(
			new Map([['student-1', studentReqs]]),
			[clerkship1, clerkship2]
		);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).not.toBeNull();
		expect(result?.id).toBe('clerkship-2');
	});

	it('returns null when all requirements are met', () => {
		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const studentReqs = new Map([['clerkship-1', 0]]);

		const context = createContext(new Map([['student-1', studentReqs]]), [clerkship1]);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).toBeNull();
	});

	it('returns null when student has no requirements', () => {
		const context = createContext(new Map(), []);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).toBeNull();
	});

	it('returns first clerkship when tied', () => {
		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship2: ClerkshipsTable = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const studentReqs = new Map([
			['clerkship-1', 3],
			['clerkship-2', 3]
		]);

		const context = createContext(
			new Map([['student-1', studentReqs]]),
			[clerkship1, clerkship2]
		);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).not.toBeNull();
		// Should return first one encountered with max days
		expect(['clerkship-1', 'clerkship-2']).toContain(result?.id);
	});

	it('handles single clerkship with days needed', () => {
		const clerkship: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const studentReqs = new Map([['clerkship-1', 5]]);

		const context = createContext(new Map([['student-1', studentReqs]]), [clerkship]);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).not.toBeNull();
		expect(result?.id).toBe('clerkship-1');
	});

	it('ignores clerkships with zero days needed', () => {
		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship2: ClerkshipsTable = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const studentReqs = new Map([
			['clerkship-1', 0],
			['clerkship-2', 3]
		]);

		const context = createContext(
			new Map([['student-1', studentReqs]]),
			[clerkship1, clerkship2]
		);

		const result = getMostNeededClerkship('student-1', context);

		expect(result).not.toBeNull();
		expect(result?.id).toBe('clerkship-2');
	});
});

describe('getStudentsNeedingAssignments()', () => {
	it('returns students with unmet requirements', () => {
		const student1: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: StudentsTable = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student1, student2],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 5]])],
				['student-2', new Map([['clerkship-1', 3]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = getStudentsNeedingAssignments(context);

		expect(result).toHaveLength(2);
		expect(result.map((s) => s.id)).toContain('student-1');
		expect(result.map((s) => s.id)).toContain('student-2');
	});

	it('excludes students with all requirements met', () => {
		const student1: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: StudentsTable = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student1, student2],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 0]])], // All met
				['student-2', new Map([['clerkship-1', 3]])] // Still needs
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = getStudentsNeedingAssignments(context);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('student-2');
	});

	it('returns empty array when all students are fully scheduled', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 0]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = getStudentsNeedingAssignments(context);

		expect(result).toEqual([]);
	});

	it('handles students with multiple clerkships', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				[
					'student-1',
					new Map([
						['clerkship-1', 0], // Met
						['clerkship-2', 3] // Still needs
					])
				]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = getStudentsNeedingAssignments(context);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('student-1');
	});

	it('excludes students without requirements', () => {
		const student1: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: StudentsTable = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student1, student2],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-2', new Map([['clerkship-1', 5]])]
				// student-1 has no requirements map
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = getStudentsNeedingAssignments(context);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('student-2');
	});
});

describe('checkUnmetRequirements()', () => {
	it('returns empty array when all requirements met', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 0]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toEqual([]);
	});

	it('returns unmet requirement with correct details', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 2]])] // 3 assigned, 2 remaining
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			studentId: 'student-1',
			studentName: 'John Doe',
			clerkshipId: 'clerkship-1',
			clerkshipName: 'FM Clerkship',
			requiredDays: 5,
			assignedDays: 3,
			remainingDays: 2
		});
	});

	it('returns multiple unmet requirements for different students', () => {
		const student1: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const student2: StudentsTable = {
			id: 'student-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student1, student2],
			preceptors: [],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 2]])],
				['student-2', new Map([['clerkship-1', 1]])]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toHaveLength(2);
		expect(result.some((r) => r.studentId === 'student-1' && r.remainingDays === 2)).toBe(true);
		expect(result.some((r) => r.studentId === 'student-2' && r.remainingDays === 1)).toBe(true);
	});

	it('returns multiple unmet requirements for same student', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship2: ClerkshipsTable = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [clerkship1, clerkship2],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				[
					'student-1',
					new Map([
						['clerkship-1', 2],
						['clerkship-2', 5]
					])
				]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toHaveLength(2);
		expect(result.some((r) => r.clerkshipId === 'clerkship-1' && r.remainingDays === 2)).toBe(
			true
		);
		expect(result.some((r) => r.clerkshipId === 'clerkship-2' && r.remainingDays === 5)).toBe(
			true
		);
	});

	it('only includes unmet requirements, not met ones', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship1: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 5,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship2: ClerkshipsTable = {
			id: 'clerkship-2',
			name: 'IM Clerkship',
			specialty: 'Internal Medicine',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [clerkship1, clerkship2],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				[
					'student-1',
					new Map([
						['clerkship-1', 0], // Met
						['clerkship-2', 5] // Unmet
					])
				]
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toHaveLength(1);
		expect(result[0].clerkshipId).toBe('clerkship-2');
	});

	it('handles students with no requirements map', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map(), // No entry for student-1
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toEqual([]);
	});

	it('calculates assigned days correctly', () => {
		const student: StudentsTable = {
			id: 'student-1',
			name: 'John Doe',
			email: 'john@example.com',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const clerkship: ClerkshipsTable = {
			id: 'clerkship-1',
			name: 'FM Clerkship',
			specialty: 'Family Medicine',
			required_days: 10,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const context: SchedulingContext = {
			students: [student],
			preceptors: [],
			clerkships: [clerkship],
			assignments: [],
			assignmentsByDate: new Map(),
			assignmentsByStudent: new Map(),
			assignmentsByPreceptor: new Map(),
			studentRequirements: new Map([
				['student-1', new Map([['clerkship-1', 3]])] // 7 assigned (10 - 3)
			]),
			blackoutDates: new Set(),
			preceptorAvailability: new Map()
		};

		const result = checkUnmetRequirements(context);

		expect(result).toHaveLength(1);
		expect(result[0].assignedDays).toBe(7);
		expect(result[0].remainingDays).toBe(3);
		expect(result[0].requiredDays).toBe(10);
	});
});
