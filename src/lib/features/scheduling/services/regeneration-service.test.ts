// @ts-nocheck
/**
 * Regeneration Service Tests
 *
 * Tests for schedule regeneration functionality including:
 * - Crediting past assignments to requirements
 * - Finding replacement preceptors
 * - Applying minimal-change strategy
 */

import { describe, it, expect } from 'vitest';
import {
	creditPastAssignmentsToRequirements,
	findReplacementPreceptor,
	applyMinimalChangeStrategy
} from './regeneration-service';
import type { SchedulingContext } from '../types/scheduling-context';
import type { Selectable } from 'kysely';
import type { ScheduleAssignments } from '$lib/db/types';

/**
 * Helper to create mock scheduling context
 */
function createMockContext(): SchedulingContext {
	const now = new Date().toISOString();
	return {
		students: [
			{
				id: 'student-1',
				name: 'Student 1',
				email: 'student1@example.com',
				cohort: '2025',
				created_at: now,
				updated_at: now
			},
			{
				id: 'student-2',
				name: 'Student 2',
				email: 'student2@example.com',
				cohort: '2025',
				created_at: now,
				updated_at: now
			}
		],
		preceptors: [
			{
				id: 'preceptor-1',
				name: 'Dr. Smith',
				email: 'smith@example.com',
				specialty: 'Cardiology',
				max_students: 2,
				site_id: 'site-1',
				created_at: now,
				updated_at: now
			},
			{
				id: 'preceptor-2',
				name: 'Dr. Jones',
				email: 'jones@example.com',
				specialty: 'Neurology',
				max_students: 2,
				site_id: 'site-1',
				created_at: now,
				updated_at: now
			},
			{
				id: 'preceptor-3',
				name: 'Dr. Brown',
				email: 'brown@example.com',
				specialty: 'Cardiology',
				max_students: 1,
				site_id: 'site-1',
				created_at: now,
				updated_at: now
			}
		],
		clerkships: [
			{
				id: 'clerkship-1',
				name: 'Cardiology Rotation',
				specialty: 'Cardiology',
				required_days: 10,
				description: null,
				created_at: now,
				updated_at: now
			},
			{
				id: 'clerkship-2',
				name: 'Neurology Rotation',
				specialty: 'Neurology',
				required_days: 8,
				description: null,
				created_at: now,
				updated_at: now
			}
		],
		studentRequirements: new Map([
			[
				'student-1',
				new Map([
					['clerkship-1', 10],
					['clerkship-2', 8]
				])
			],
			[
				'student-2',
				new Map([
					['clerkship-1', 10],
					['clerkship-2', 8]
				])
			]
		]),
		preceptorAvailability: new Map([
			['preceptor-1', new Set(['2025-01-15', '2025-01-16', '2025-01-17'])],
			['preceptor-2', new Set(['2025-01-15', '2025-01-16'])],
			['preceptor-3', new Set(['2025-01-15', '2025-01-16', '2025-01-17'])]
		]),
		blackoutDates: new Set(),
		startDate: '2025-01-01',
		endDate: '2025-12-31',
		assignments: [],
		assignmentsByDate: new Map(),
		assignmentsByStudent: new Map(),
		assignmentsByPreceptor: new Map()
	};
}

/**
 * Helper to create mock assignment
 */
function createMockAssignment(overrides: any = {}): Selectable<ScheduleAssignments> {
	return {
		id: crypto.randomUUID(),
		student_id: 'student-1',
		preceptor_id: 'preceptor-1',
		clerkship_id: 'clerkship-1',
		date: '2025-01-10',
		status: 'scheduled',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

describe('Regeneration Service', () => {
	describe('creditPastAssignmentsToRequirements()', () => {
		it('reduces student requirements by number of past assignments', () => {
			const context = createMockContext();

			// Student 1 initially needs 10 days of clerkship-1
			expect(context.studentRequirements.get('student-1')?.get('clerkship-1')).toBe(10);

			const pastAssignments = [
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' })
			];

			const result = creditPastAssignmentsToRequirements(context, pastAssignments);

			// After crediting 3 past assignments, should need 7 more days
			expect(context.studentRequirements.get('student-1')?.get('clerkship-1')).toBe(7);
			expect(result.totalPastAssignments).toBe(3);
		});

		it('does not reduce requirements below zero', () => {
			const context = createMockContext();

			// Student 1 needs 10 days of clerkship-1
			const pastAssignments = Array(15)
				.fill(null)
				.map(() =>
					createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' })
				);

			creditPastAssignmentsToRequirements(context, pastAssignments);

			// Should not go below 0
			expect(context.studentRequirements.get('student-1')?.get('clerkship-1')).toBe(0);
		});

		it('handles multiple students with different past assignments', () => {
			const context = createMockContext();

			const pastAssignments = [
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' }),
				createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' }),
				createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' })
			];

			creditPastAssignmentsToRequirements(context, pastAssignments);

			expect(context.studentRequirements.get('student-1')?.get('clerkship-1')).toBe(8); // 10 - 2
			expect(context.studentRequirements.get('student-2')?.get('clerkship-2')).toBe(5); // 8 - 3
		});

		it('ignores past assignments for students not in context', () => {
			const context = createMockContext();

			const pastAssignments = [
				createMockAssignment({
					student_id: 'non-existent-student',
					clerkship_id: 'clerkship-1'
				})
			];

			const result = creditPastAssignmentsToRequirements(context, pastAssignments);

			// Should still count the assignment but not crash
			expect(result.totalPastAssignments).toBe(1);
		});
	});

	describe('findReplacementPreceptor()', () => {
		it('finds replacement preceptor with matching specialty', () => {
			const context = createMockContext();
			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1', // Cardiology
				clerkship_id: 'clerkship-1', // Cardiology
				date: '2025-01-15'
			});

			// Preceptor 1 is unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should find preceptor-3 (also Cardiology)
			expect(replacementId).toBe('preceptor-3');
		});

		it('returns null when no replacement available', () => {
			const context = createMockContext();
			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1', // Cardiology
				clerkship_id: 'clerkship-1', // Cardiology
				date: '2025-01-15'
			});

			// All cardiology preceptors unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1', 'preceptor-3']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			expect(replacementId).toBeNull();
		});

		it('checks preceptor availability for the date', () => {
			const context = createMockContext();
			context.preceptorAvailability.set('preceptor-3', new Set(['2025-01-20'])); // Not available on 2025-01-15

			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1', // Cardiology
				clerkship_id: 'clerkship-1', // Cardiology
				date: '2025-01-15'
			});

			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should return null because preceptor-3 is not available on 2025-01-15
			expect(replacementId).toBeNull();
		});

		it('checks preceptor capacity on the date', () => {
			const context = createMockContext();

			// Preceptor 3 has max_students = 1 and already has an assignment on 2025-01-15
			// Add an existing assignment to the context for preceptor-3 on that date
			const existingAssignment = {
				studentId: 'other-student',
				preceptorId: 'preceptor-3',
				clerkshipId: 'clerkship-1',
				date: '2025-01-15'
			};
			context.assignmentsByDate.set('2025-01-15', [existingAssignment]);

			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1',
				clerkship_id: 'clerkship-1',
				date: '2025-01-15'
			});

			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should return null because preceptor-3 is at capacity (max_students=1, already has 1)
			expect(replacementId).toBeNull();
		});
	});

	describe('applyMinimalChangeStrategy()', () => {
		it('preserves valid assignments and returns them as preserved', () => {
			const context = createMockContext();

			const preservableAssignments = [
				createMockAssignment({
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-01-15'
				}),
				createMockAssignment({
					student_id: 'student-2',
					preceptor_id: 'preceptor-2',
					clerkship_id: 'clerkship-2',
					date: '2025-01-16'
				})
			];

			const affectedAssignments: Selectable<ScheduleAssignments>[] = [];
			const unavailablePreceptorIds = new Set<string>();

			const result = applyMinimalChangeStrategy(
				context,
				preservableAssignments,
				affectedAssignments,
				unavailablePreceptorIds
			);

			// Result is Assignment[] which uses camelCase
			expect(result).toHaveLength(2);
			expect(result[0].studentId).toBe('student-1');
			expect(result[1].studentId).toBe('student-2');
		});

		it('attempts to find replacements for affected assignments', () => {
			const context = createMockContext();

			const preservableAssignments: Selectable<ScheduleAssignments>[] = [];
			const affectedAssignments = [
				createMockAssignment({
					student_id: 'student-1',
					preceptor_id: 'preceptor-1', // Cardiology, now unavailable
					clerkship_id: 'clerkship-1',
					date: '2025-01-15'
				})
			];

			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const result = applyMinimalChangeStrategy(
				context,
				preservableAssignments,
				affectedAssignments,
				unavailablePreceptorIds
			);

			// Should find replacement (preceptor-3) - result uses camelCase
			expect(result).toHaveLength(1);
			expect(result[0].preceptorId).toBe('preceptor-3');
		});

		it('does not include affected assignments when no replacement found', () => {
			const context = createMockContext();

			const preservableAssignments: Selectable<ScheduleAssignments>[] = [];
			const affectedAssignments = [
				createMockAssignment({
					student_id: 'student-1',
					preceptor_id: 'preceptor-1', // Cardiology
					clerkship_id: 'clerkship-1',
					date: '2025-01-15'
				})
			];

			// All cardiology preceptors unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1', 'preceptor-3']);

			const result = applyMinimalChangeStrategy(
				context,
				preservableAssignments,
				affectedAssignments,
				unavailablePreceptorIds
			);

			// Should not include the affected assignment
			expect(result).toHaveLength(0);
		});

		it('updates context with preserved and replaced assignments', () => {
			const context = createMockContext();

			const preservableAssignments = [
				createMockAssignment({
					student_id: 'student-1',
					preceptor_id: 'preceptor-2',
					clerkship_id: 'clerkship-2',
					date: '2025-01-15'
				})
			];

			const affectedAssignments: Selectable<ScheduleAssignments>[] = [];
			const unavailablePreceptorIds = new Set<string>();

			const result = applyMinimalChangeStrategy(
				context,
				preservableAssignments,
				affectedAssignments,
				unavailablePreceptorIds
			);

			// Context should be updated - check assignments array
			expect(context.assignments).toHaveLength(1);
			expect(context.assignments[0].preceptorId).toBe('preceptor-2');
			expect(context.assignments[0].date).toBe('2025-01-15');

			// Also verify the result includes the preserved assignment
			expect(result).toHaveLength(1);
		});
	});
});
