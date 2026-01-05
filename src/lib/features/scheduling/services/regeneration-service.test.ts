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
	applyMinimalChangeStrategy,
	prepareCompletionContext
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
		it('finds replacement preceptor when original is unavailable', () => {
			const context = createMockContext();
			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1',
				clerkship_id: 'clerkship-1',
				date: '2025-01-15'
			});

			// Preceptor 1 is unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should find any available preceptor (preceptor-2 or preceptor-3)
			expect(['preceptor-2', 'preceptor-3']).toContain(replacementId);
		});

		it('returns null when all preceptors unavailable', () => {
			const context = createMockContext();
			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1',
				clerkship_id: 'clerkship-1',
				date: '2025-01-15'
			});

			// All preceptors unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1', 'preceptor-2', 'preceptor-3']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			expect(replacementId).toBeNull();
		});

		it('checks preceptor availability for the date', () => {
			const context = createMockContext();
			// Set preceptor-2 and preceptor-3 to not be available on 2025-01-15
			context.preceptorAvailability.set('preceptor-2', new Set(['2025-01-20']));
			context.preceptorAvailability.set('preceptor-3', new Set(['2025-01-20']));

			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1',
				clerkship_id: 'clerkship-1',
				date: '2025-01-15'
			});

			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should return null because no other preceptor is available on 2025-01-15
			expect(replacementId).toBeNull();
		});

		it('checks preceptor capacity on the date', () => {
			const context = createMockContext();

			// Preceptor-2 and preceptor-3 both have existing assignments
			// Preceptor-3 has max_students = 1, preceptor-2 has max_students = 2
			const existingAssignments = [
				{
					studentId: 'other-student-1',
					preceptorId: 'preceptor-2',
					clerkshipId: 'clerkship-1',
					date: '2025-01-15'
				},
				{
					studentId: 'other-student-2',
					preceptorId: 'preceptor-2',
					clerkshipId: 'clerkship-1',
					date: '2025-01-15'
				},
				{
					studentId: 'other-student-3',
					preceptorId: 'preceptor-3',
					clerkshipId: 'clerkship-1',
					date: '2025-01-15'
				}
			];
			context.assignmentsByDate.set('2025-01-15', existingAssignments);

			const assignment = createMockAssignment({
				preceptor_id: 'preceptor-1',
				clerkship_id: 'clerkship-1',
				date: '2025-01-15'
			});

			const unavailablePreceptorIds = new Set(['preceptor-1']);

			const replacementId = findReplacementPreceptor(assignment, context, unavailablePreceptorIds);

			// Should return null because both preceptor-2 and preceptor-3 are at capacity
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
					preceptor_id: 'preceptor-1', // now unavailable
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

			// Should find replacement (preceptor-2 or preceptor-3) - result uses camelCase
			expect(result).toHaveLength(1);
			expect(['preceptor-2', 'preceptor-3']).toContain(result[0].preceptorId);
		});

		it('does not include affected assignments when no replacement found', () => {
			const context = createMockContext();

			const preservableAssignments: Selectable<ScheduleAssignments>[] = [];
			const affectedAssignments = [
				createMockAssignment({
					student_id: 'student-1',
					preceptor_id: 'preceptor-1',
					clerkship_id: 'clerkship-1',
					date: '2025-01-15'
				})
			];

			// All preceptors unavailable
			const unavailablePreceptorIds = new Set(['preceptor-1', 'preceptor-2', 'preceptor-3']);

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

	describe('prepareCompletionContext()', () => {
		/**
		 * Mock database that returns existing assignments
		 */
		function createMockDb(existingAssignments: Selectable<ScheduleAssignments>[]) {
			const mockQueryBuilder = {
				where: function() { return this; },
				orderBy: function() { return this; },
				execute: async () => existingAssignments
			};

			return {
				selectFrom: () => ({
					selectAll: () => mockQueryBuilder
				})
			} as any;
		}

		it('should load all existing assignments and credit them to requirements', async () => {
			const context = createMockContext();

			// Student 1 needs 10 days of clerkship-1, 8 days of clerkship-2
			// Student 2 needs 10 days of clerkship-1, 8 days of clerkship-2

			const existingAssignments = [
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' }),
				createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' }),
				createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' })
			];

			const db = createMockDb(existingAssignments);

			const result = await prepareCompletionContext(
				db,
				context,
				'2025-01-01',
				'2025-12-31'
			);

			// Should credit the assignments
			expect(context.studentRequirements.get('student-1')?.get('clerkship-1')).toBe(7); // 10 - 3
			expect(context.studentRequirements.get('student-2')?.get('clerkship-2')).toBe(6); // 8 - 2

			// Should return total existing assignments
			expect(result.totalExistingAssignments).toBe(5);
		});

		it('should identify students with unmet requirements', async () => {
			const context = createMockContext();

			// Give student-1 all their clerkship-1 requirements (10 assignments)
			// Student-2 gets only partial clerkship-1 (5 assignments, needs 10)
			const existingAssignments = [
				...Array(10).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' })
				),
				...Array(5).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-1' })
				)
			];

			const db = createMockDb(existingAssignments);

			const result = await prepareCompletionContext(
				db,
				context,
				'2025-01-01',
				'2025-12-31'
			);

			// Both students should have unmet requirements
			// student-1: still needs clerkship-2 (8 days)
			// student-2: still needs clerkship-1 (5 days) and clerkship-2 (8 days)
			expect(result.studentsWithUnmetRequirements).toContain('student-1');
			expect(result.studentsWithUnmetRequirements).toContain('student-2');
			expect(result.studentsWithUnmetRequirements).toHaveLength(2);

			// Verify unmet requirements map
			expect(result.unmetRequirementsByStudent.get('student-1')?.get('clerkship-2')).toBe(8);
			expect(result.unmetRequirementsByStudent.get('student-2')?.get('clerkship-1')).toBe(5);
			expect(result.unmetRequirementsByStudent.get('student-2')?.get('clerkship-2')).toBe(8);
		});

		it('should add all existing assignments to context tracking maps', async () => {
			const context = createMockContext();

			const existingAssignments = [
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

			const db = createMockDb(existingAssignments);

			await prepareCompletionContext(
				db,
				context,
				'2025-01-01',
				'2025-12-31'
			);

			// Check context.assignments
			expect(context.assignments).toHaveLength(2);

			// Check assignmentsByDate
			expect(context.assignmentsByDate.get('2025-01-15')).toHaveLength(1);
			expect(context.assignmentsByDate.get('2025-01-16')).toHaveLength(1);

			// Check assignmentsByStudent
			expect(context.assignmentsByStudent.get('student-1')).toHaveLength(1);
			expect(context.assignmentsByStudent.get('student-2')).toHaveLength(1);

			// Check assignmentsByPreceptor
			expect(context.assignmentsByPreceptor.get('preceptor-1')).toHaveLength(1);
			expect(context.assignmentsByPreceptor.get('preceptor-2')).toHaveLength(1);
		});

		it('should return empty list when all students are complete', async () => {
			const context = createMockContext();

			// Give both students all their requirements
			// student-1: 10 clerkship-1, 8 clerkship-2
			// student-2: 10 clerkship-1, 8 clerkship-2
			const existingAssignments = [
				...Array(10).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-1' })
				),
				...Array(8).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-1', clerkship_id: 'clerkship-2' })
				),
				...Array(10).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-1' })
				),
				...Array(8).fill(null).map(() =>
					createMockAssignment({ student_id: 'student-2', clerkship_id: 'clerkship-2' })
				)
			];

			const db = createMockDb(existingAssignments);

			const result = await prepareCompletionContext(
				db,
				context,
				'2025-01-01',
				'2025-12-31'
			);

			// No students should have unmet requirements
			expect(result.studentsWithUnmetRequirements).toHaveLength(0);
			expect(result.totalExistingAssignments).toBe(36);
		});
	});
});
