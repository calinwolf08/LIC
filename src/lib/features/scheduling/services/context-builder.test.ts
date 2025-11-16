/**
 * ContextBuilder Unit Tests
 *
 * Tests for building scheduling context from database data
 */

import { describe, it, expect } from 'vitest';
import { buildSchedulingContext } from './context-builder';
import type {
	StudentsTable,
	PreceptorsTable,
	ClerkshipsTable,
	PreceptorAvailabilityTable
} from '$lib/db/types';

describe('buildSchedulingContext()', () => {
	it('builds context with all required fields', () => {
		const students: StudentsTable[] = [
			{
				id: 'student-1',
				name: 'John Doe',
				email: 'john@example.com',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
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

		const blackoutDates = ['2024-12-25', '2024-01-01'];
		const availabilityRecords: PreceptorAvailabilityTable[] = [];
		const startDate = '2024-01-01';
		const endDate = '2024-12-31';

		const context = buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			startDate,
			endDate
		);

		expect(context.students).toBe(students);
		expect(context.preceptors).toBe(preceptors);
		expect(context.clerkships).toBe(clerkships);
		expect(context.startDate).toBe(startDate);
		expect(context.endDate).toBe(endDate);
		expect(context.assignments).toEqual([]);
		expect(context.assignmentsByDate).toBeInstanceOf(Map);
		expect(context.assignmentsByStudent).toBeInstanceOf(Map);
		expect(context.assignmentsByPreceptor).toBeInstanceOf(Map);
		expect(context.studentRequirements).toBeInstanceOf(Map);
		expect(context.blackoutDates).toBeInstanceOf(Set);
		expect(context.preceptorAvailability).toBeInstanceOf(Map);
	});

	it('converts blackout dates array to Set', () => {
		const blackoutDates = ['2024-12-25', '2024-01-01', '2024-07-04'];

		const context = buildSchedulingContext([], [], [], blackoutDates, [], '2024-01-01', '2024-12-31');

		expect(context.blackoutDates).toBeInstanceOf(Set);
		expect(context.blackoutDates.size).toBe(3);
		expect(context.blackoutDates.has('2024-12-25')).toBe(true);
		expect(context.blackoutDates.has('2024-01-01')).toBe(true);
		expect(context.blackoutDates.has('2024-07-04')).toBe(true);
	});

	it('handles empty blackout dates', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.blackoutDates.size).toBe(0);
	});

	it('initializes empty availability sets for all preceptors', () => {
		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				specialty: 'Internal Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			[],
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.preceptorAvailability.size).toBe(2);
		expect(context.preceptorAvailability.has('preceptor-1')).toBe(true);
		expect(context.preceptorAvailability.has('preceptor-2')).toBe(true);
		expect(context.preceptorAvailability.get('preceptor-1')).toBeInstanceOf(Set);
		expect(context.preceptorAvailability.get('preceptor-1')?.size).toBe(0);
		expect(context.preceptorAvailability.get('preceptor-2')?.size).toBe(0);
	});

	it('populates preceptor availability from records', () => {
		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailabilityTable[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-1',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		const availability = context.preceptorAvailability.get('preceptor-1')!;
		expect(availability.size).toBe(2);
		expect(availability.has('2024-01-15')).toBe(true);
		expect(availability.has('2024-01-16')).toBe(true);
	});

	it('only includes available dates (is_available = 1)', () => {
		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailabilityTable[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-1',
				date: '2024-01-16',
				is_available: 0, // Not available
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		const availability = context.preceptorAvailability.get('preceptor-1')!;
		expect(availability.size).toBe(1);
		expect(availability.has('2024-01-15')).toBe(true);
		expect(availability.has('2024-01-16')).toBe(false);
	});

	it('handles availability for multiple preceptors', () => {
		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				specialty: 'Internal Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailabilityTable[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-2',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.preceptorAvailability.get('preceptor-1')?.has('2024-01-15')).toBe(true);
		expect(context.preceptorAvailability.get('preceptor-1')?.has('2024-01-16')).toBe(false);
		expect(context.preceptorAvailability.get('preceptor-2')?.has('2024-01-15')).toBe(false);
		expect(context.preceptorAvailability.get('preceptor-2')?.has('2024-01-16')).toBe(true);
	});

	it('ignores availability records for unknown preceptors', () => {
		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const availabilityRecords: PreceptorAvailabilityTable[] = [
			{
				id: '1',
				preceptor_id: 'unknown-preceptor',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			[],
			preceptors,
			[],
			[],
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.preceptorAvailability.size).toBe(1);
		expect(context.preceptorAvailability.has('unknown-preceptor')).toBe(false);
		expect(context.preceptorAvailability.get('preceptor-1')?.size).toBe(0);
	});

	it('initializes student requirements correctly', () => {
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

		const context = buildSchedulingContext(
			students,
			[],
			clerkships,
			[],
			[],
			'2024-01-01',
			'2024-12-31'
		);

		expect(context.studentRequirements.size).toBe(2);

		const student1Reqs = context.studentRequirements.get('student-1')!;
		expect(student1Reqs.get('clerkship-1')).toBe(5);
		expect(student1Reqs.get('clerkship-2')).toBe(10);

		const student2Reqs = context.studentRequirements.get('student-2')!;
		expect(student2Reqs.get('clerkship-1')).toBe(5);
		expect(student2Reqs.get('clerkship-2')).toBe(10);
	});

	it('initializes empty assignment tracking maps', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.assignmentsByDate).toBeInstanceOf(Map);
		expect(context.assignmentsByDate.size).toBe(0);

		expect(context.assignmentsByStudent).toBeInstanceOf(Map);
		expect(context.assignmentsByStudent.size).toBe(0);

		expect(context.assignmentsByPreceptor).toBeInstanceOf(Map);
		expect(context.assignmentsByPreceptor.size).toBe(0);
	});

	it('initializes empty assignments array', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.assignments).toEqual([]);
	});

	it('handles complex scenario with all data', () => {
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

		const preceptors: PreceptorsTable[] = [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Family Medicine',
				max_students: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				specialty: 'Internal Medicine',
				max_students: 2,
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

		const blackoutDates = ['2024-12-25', '2024-01-01'];

		const availabilityRecords: PreceptorAvailabilityTable[] = [
			{
				id: '1',
				preceptor_id: 'preceptor-1',
				date: '2024-01-15',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '2',
				preceptor_id: 'preceptor-2',
				date: '2024-01-16',
				is_available: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				id: '3',
				preceptor_id: 'preceptor-2',
				date: '2024-01-17',
				is_available: 0,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}
		];

		const context = buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			availabilityRecords,
			'2024-01-01',
			'2024-12-31'
		);

		// Verify all components are initialized correctly
		expect(context.students).toHaveLength(2);
		expect(context.preceptors).toHaveLength(2);
		expect(context.clerkships).toHaveLength(2);
		expect(context.blackoutDates.size).toBe(2);
		expect(context.preceptorAvailability.size).toBe(2);
		expect(context.studentRequirements.size).toBe(2);
		expect(context.preceptorAvailability.get('preceptor-1')?.size).toBe(1);
		expect(context.preceptorAvailability.get('preceptor-2')?.size).toBe(1);
		expect(context.studentRequirements.get('student-1')?.size).toBe(2);
		expect(context.studentRequirements.get('student-2')?.size).toBe(2);
	});

	it('handles empty inputs gracefully', () => {
		const context = buildSchedulingContext([], [], [], [], [], '2024-01-01', '2024-12-31');

		expect(context.students).toEqual([]);
		expect(context.preceptors).toEqual([]);
		expect(context.clerkships).toEqual([]);
		expect(context.blackoutDates.size).toBe(0);
		expect(context.preceptorAvailability.size).toBe(0);
		expect(context.studentRequirements.size).toBe(0);
		expect(context.assignments).toEqual([]);
	});
});
