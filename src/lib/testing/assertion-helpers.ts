/**
 * Assertion Helpers for Integration Tests
 *
 * Common assertion patterns for validating scheduling results.
 * Note: schedule_assignments uses 'date' column (single date per assignment),
 * not start_date/end_date ranges.
 */

import { expect } from 'vitest';
import type { Kysely, Selectable } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';

type Assignment = Selectable<ScheduleAssignments>;

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
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Each assignment represents one day
	expect(assignments.length).toBe(expectedDays);
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
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// All assignments should be to the same preceptor
	const preceptorIds = new Set(assignments.map((a: Assignment) => a.preceptor_id));
	expect(preceptorIds.size).toBe(1);

	// Assignments should be continuous (no gaps)
	const sortedAssignments = assignments.sort(
		(a: Assignment, b: Assignment) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);

	for (let i = 1; i < sortedAssignments.length; i++) {
		const prevDate = new Date(sortedAssignments[i - 1].date);
		const currentDate = new Date(sortedAssignments[i].date);
		const daysDiff = Math.ceil(
			(currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
		);
		// Should be exactly 1 day apart (consecutive days)
		expect(daysDiff).toBe(1);
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
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Group assignments by preceptor to find blocks
	const byPreceptor = new Map<string, Assignment[]>();
	for (const assignment of assignments) {
		const list = byPreceptor.get(assignment.preceptor_id) || [];
		list.push(assignment);
		byPreceptor.set(assignment.preceptor_id, list);
	}

	// Each block (preceptor's assignments) should be <= blockSizeDays
	for (const [, preceptorAssignments] of byPreceptor.entries()) {
		expect(preceptorAssignments.length).toBeLessThanOrEqual(blockSizeDays);
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
	// Get all assignments for this preceptor, grouped by date
	const result = await db
		.selectFrom('schedule_assignments')
		.select(['date'])
		.select(({ fn }) => [fn.countAll<number>().as('student_count')])
		.where('preceptor_id', '=', preceptorId)
		.groupBy('date')
		.execute();

	// Check that no day exceeds max capacity
	for (const row of result) {
		expect(row.student_count).toBeLessThanOrEqual(maxStudentsPerDay);
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
		.selectFrom('schedule_assignments')
		.innerJoin('preceptors', 'preceptors.id', 'schedule_assignments.preceptor_id')
		.select(['schedule_assignments.id', 'preceptors.health_system_id'])
		.where('schedule_assignments.student_id', '=', studentId)
		.where('schedule_assignments.clerkship_id', '=', clerkshipId)
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
	// With single-date assignments, conflicts would be multiple assignments on same date
	const result = await db
		.selectFrom('schedule_assignments')
		.select(['date'])
		.select(({ fn }) => [fn.countAll<number>().as('count')])
		.where('student_id', '=', studentId)
		.groupBy('date')
		.execute();

	// Each date should have at most one assignment per student
	for (const row of result) {
		expect(row.count).toBe(1);
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
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.where('preceptor_id', 'in', memberIds)
		.execute();

	// Each team member should have at least one assignment
	const assignedMemberIds = new Set(assignments.map((a: Assignment) => a.preceptor_id));
	expect(assignedMemberIds.size).toBeGreaterThan(0);

	// Calculate days per team member (each assignment = 1 day)
	const daysByMember = new Map<string, number>();
	for (const assignment of assignments) {
		const currentDays = daysByMember.get(assignment.preceptor_id) || 0;
		daysByMember.set(assignment.preceptor_id, currentDays + 1);
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
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId)
		.execute();

	expect(assignments.length).toBeGreaterThan(0);

	// Check that fallback preceptor was used
	const preceptorIds = assignments.map((a: Assignment) => a.preceptor_id);
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
		.selectFrom('schedule_assignments')
		.select(({ fn }) => [fn.countAll<number>().as('count')])
		.where('preceptor_id', '=', preceptorId)
		.executeTakeFirst();

	const count = result?.count || 0;
	expect(count).toBeLessThanOrEqual(maxStudentsPerYear);
}
