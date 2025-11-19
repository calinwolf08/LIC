/**
 * Assertion Helpers for Integration Tests
 *
 * Common assertion patterns for validating scheduling results.
 */

import { expect } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

/**
 * Asserts that a student has assignments covering all required days
 */
export async function assertStudentHasCompleteAssignments(
	db: Kysely<DB>,
	studentId: string,
	clerkshipId: string,
	expectedDays: number
) {
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Calculate total days covered
	let totalDays = 0;
	for (const assignment of assignments) {
		const start = new Date(assignment.start_date);
		const end = new Date(assignment.end_date);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		totalDays += days;
	}

	expect(totalDays).toBe(expectedDays);
}

/**
 * Asserts that assignments use continuous single preceptor strategy
 */
export async function assertContinuousSingleStrategy(
	db: Kysely<DB>,
	studentId: string,
	clerkshipId: string
) {
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// All assignments should be to the same preceptor
	const preceptorIds = new Set(assignments.map((a) => a.preceptor_id));
	expect(preceptorIds.size).toBe(1);

	// Assignments should be continuous (no gaps)
	const sortedAssignments = assignments.sort(
		(a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
	);

	for (let i = 1; i < sortedAssignments.length; i++) {
		const prevEnd = new Date(sortedAssignments[i - 1].end_date);
		const currentStart = new Date(sortedAssignments[i].start_date);
		const daysDiff = Math.ceil(
			(currentStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24)
		);
		expect(daysDiff).toBeLessThanOrEqual(1);
	}
}

/**
 * Asserts that assignments follow block-based strategy
 */
export async function assertBlockBasedStrategy(
	db: Kysely<DB>,
	studentId: string,
	clerkshipId: string,
	blockSizeDays: number
) {
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Each assignment should be exactly blockSizeDays or less (for last block)
	for (const assignment of assignments) {
		const start = new Date(assignment.start_date);
		const end = new Date(assignment.end_date);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		expect(days).toBeLessThanOrEqual(blockSizeDays);
	}
}

/**
 * Asserts that no capacity constraints are violated on any day
 */
export async function assertNoCapacityViolations(
	db: Kysely<DB>,
	preceptorId: string,
	maxStudentsPerDay: number
) {
	// Get all assignments for this preceptor
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.execute();

	// Build a map of date -> student count
	const dateCountMap = new Map<string, number>();

	for (const assignment of assignments) {
		const start = new Date(assignment.start_date);
		const end = new Date(assignment.end_date);

		// Iterate through each day in the assignment
		for (
			let date = new Date(start);
			date <= end;
			date.setDate(date.getDate() + 1)
		) {
			const dateKey = date.toISOString().split('T')[0];
			dateCountMap.set(dateKey, (dateCountMap.get(dateKey) || 0) + 1);
		}
	}

	// Check that no day exceeds max capacity
	for (const [date, count] of dateCountMap.entries()) {
		expect(count).toBeLessThanOrEqual(maxStudentsPerDay);
	}
}

/**
 * Asserts that health system continuity is maintained
 */
export async function assertHealthSystemContinuity(
	db: Kysely<DB>,
	studentId: string,
	clerkshipId: string
) {
	const assignments = await db
		.selectFrom('assignments')
		.innerJoin('preceptors', 'preceptors.id', 'assignments.preceptor_id')
		.select(['assignments.id', 'preceptors.health_system_id'])
		.where('assignments.student_id', '=', studentId)
		.where('assignments.clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// All assignments should be in the same health system
	const healthSystemIds = new Set(
		assignments.map((a) => a.health_system_id).filter((id) => id !== null)
	);
	expect(healthSystemIds.size).toBeLessThanOrEqual(1);
}

/**
 * Asserts that no date conflicts exist for a student
 */
export async function assertNoDateConflicts(db: Kysely<DB>, studentId: string) {
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.orderBy('start_date', 'asc')
		.execute();

	// Check for overlapping date ranges
	for (let i = 0; i < assignments.length; i++) {
		for (let j = i + 1; j < assignments.length; j++) {
			const a1Start = new Date(assignments[i].start_date);
			const a1End = new Date(assignments[i].end_date);
			const a2Start = new Date(assignments[j].start_date);
			const a2End = new Date(assignments[j].end_date);

			// Check for overlap
			const hasOverlap = a1Start <= a2End && a2Start <= a1End;
			expect(hasOverlap).toBe(false);
		}
	}
}

/**
 * Asserts that team assignments are balanced
 */
export async function assertTeamBalanced(
	db: Kysely<DB>,
	teamId: string,
	studentId: string,
	clerkshipId: string
) {
	// Get team members
	const teamMembers = await db
		.selectFrom('preceptor_team_members')
		.selectAll()
		.where('team_id', '=', teamId)
		.execute();

	expect(teamMembers.length).toBeGreaterThan(0);

	// Get assignments for this student to team members
	const memberIds = teamMembers.map((m) => m.preceptor_id);
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.where('preceptor_id', 'in', memberIds)
		.execute();

	// Each team member should have at least one assignment
	const assignedMemberIds = new Set(assignments.map((a) => a.preceptor_id));
	expect(assignedMemberIds.size).toBeGreaterThan(0);

	// Calculate days per team member
	const daysByMember = new Map<string, number>();
	for (const assignment of assignments) {
		const start = new Date(assignment.start_date);
		const end = new Date(assignment.end_date);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

		const currentDays = daysByMember.get(assignment.preceptor_id) || 0;
		daysByMember.set(assignment.preceptor_id, currentDays + days);
	}

	// Check that distribution is reasonably balanced (within 50% variance)
	const daysCounts = Array.from(daysByMember.values());
	const avgDays = daysCounts.reduce((sum, days) => sum + days, 0) / daysCounts.length;
	for (const days of daysCounts) {
		expect(days).toBeGreaterThanOrEqual(avgDays * 0.5);
		expect(days).toBeLessThanOrEqual(avgDays * 1.5);
	}
}

/**
 * Asserts that fallback was used correctly
 */
export async function assertFallbackUsed(
	db: Kysely<DB>,
	studentId: string,
	clerkshipId: string,
	primaryPreceptorId: string,
	fallbackPreceptorId: string
) {
	const assignments = await db
		.selectFrom('assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Check that fallback preceptor was used
	const preceptorIds = assignments.map((a) => a.preceptor_id);
	expect(preceptorIds).toContain(fallbackPreceptorId);

	// Primary preceptor should not be used
	expect(preceptorIds).not.toContain(primaryPreceptorId);
}

/**
 * Asserts that scheduling result has specific statistics
 */
export function assertSchedulingResultStats(
	result: any,
	expected: {
		totalAssignments?: number;
		studentsScheduled?: number;
		unmetRequirements?: number;
	}
) {
	expect(result.statistics).toBeDefined();

	if (expected.totalAssignments !== undefined) {
		expect(result.statistics.totalAssignments).toBe(expected.totalAssignments);
	}

	if (expected.studentsScheduled !== undefined) {
		expect(result.statistics.studentsScheduled).toBe(expected.studentsScheduled);
	}

	if (expected.unmetRequirements !== undefined) {
		expect(result.unmetRequirements.length).toBe(expected.unmetRequirements);
	}
}

/**
 * Asserts that no preceptor is over-assigned
 */
export async function assertNoOverAssignment(
	db: Kysely<DB>,
	preceptorId: string,
	maxStudentsPerYear: number
) {
	const result = await db
		.selectFrom('assignments')
		.select(({ fn }) => [fn.countAll<number>().as('count')])
		.where('preceptor_id', '=', preceptorId)
		.executeTakeFirst();

	const count = result?.count || 0;
	expect(count).toBeLessThanOrEqual(maxStudentsPerYear);
}
