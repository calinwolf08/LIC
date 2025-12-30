/**
 * Schedule Regeneration Service
 *
 * Handles intelligent schedule regeneration that preserves valid assignments
 * and minimizes changes when regenerating mid-schedule.
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';
import type { SchedulingContext, Assignment } from '../types';
import { getAssignmentsByDateRange } from '$lib/features/schedules/services/assignment-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling:regeneration');

/**
 * Regeneration strategy types
 */
export type RegenerationStrategy = 'minimal-change' | 'full-reoptimize' | 'completion';

/**
 * Result of crediting past assignments to requirements
 */
export interface RequirementCreditResult {
	totalPastAssignments: number;
	creditsByStudent: Map<string, Map<string, number>>; // studentId -> clerkshipId -> days credited
}

/**
 * Result of identifying assignments affected by changes
 */
export interface AffectedAssignmentsResult {
	affectedAssignments: Selectable<ScheduleAssignments>[];
	preservableAssignments: Selectable<ScheduleAssignments>[];
	unavailablePreceptorIds: Set<string>;
}

/**
 * Credit past assignments toward student requirements
 *
 * Reduces the required days for each student based on assignments they've already completed
 * before the regeneration cutoff date.
 *
 * @param context - Scheduling context with initialized requirements
 * @param pastAssignments - Assignments before the regeneration cutoff date
 * @returns Result with total past assignments and credit breakdown
 */
export function creditPastAssignmentsToRequirements(
	context: SchedulingContext,
	pastAssignments: Selectable<ScheduleAssignments>[]
): RequirementCreditResult {
	log.debug('Crediting past assignments to requirements', {
		pastAssignmentsCount: pastAssignments.length,
		studentCount: context.students.length
	});

	const creditsByStudent = new Map<string, Map<string, number>>();

	for (const assignment of pastAssignments) {
		const studentReqs = context.studentRequirements.get(assignment.student_id);
		if (!studentReqs) continue;

		const currentDaysNeeded = studentReqs.get(assignment.clerkship_id) || 0;
		if (currentDaysNeeded > 0) {
			// Credit this day toward the requirement
			studentReqs.set(assignment.clerkship_id, currentDaysNeeded - 1);

			// Track credits for reporting
			if (!creditsByStudent.has(assignment.student_id)) {
				creditsByStudent.set(assignment.student_id, new Map());
			}
			const studentCredits = creditsByStudent.get(assignment.student_id)!;
			const currentCredit = studentCredits.get(assignment.clerkship_id) || 0;
			studentCredits.set(assignment.clerkship_id, currentCredit + 1);
		}
	}

	log.info('Past assignments credited', {
		totalPastAssignments: pastAssignments.length,
		studentsWithCredits: creditsByStudent.size
	});

	return {
		totalPastAssignments: pastAssignments.length,
		creditsByStudent
	};
}

/**
 * Identify future assignments affected by preceptor availability changes
 *
 * Analyzes which future assignments need to be changed vs which can be preserved.
 *
 * @param db - Database connection
 * @param context - Scheduling context
 * @param regenerateFromDate - Date to start regenerating from
 * @param endDate - End date of schedule
 * @returns Breakdown of affected vs preservable assignments
 */
export async function identifyAffectedAssignments(
	db: Kysely<DB>,
	context: SchedulingContext,
	regenerateFromDate: string,
	endDate: string
): Promise<AffectedAssignmentsResult> {
	log.debug('Identifying affected assignments', {
		regenerateFromDate,
		endDate,
		preceptorCount: context.preceptors.length
	});

	// Get all future assignments (not yet cleared)
	const futureAssignments = await getAssignmentsByDateRange(
		db,
		regenerateFromDate,
		endDate
	);

	// Build set of currently unavailable preceptor IDs
	const unavailablePreceptorIds = new Set<string>();

	for (const preceptor of context.preceptors) {
		const availableDates = context.preceptorAvailability.get(preceptor.id!);
		// If preceptor has no availability records, consider them unavailable
		if (!availableDates || availableDates.size === 0) {
			unavailablePreceptorIds.add(preceptor.id!);
		}
	}

	// Separate assignments into affected vs preservable
	const affectedAssignments: Selectable<ScheduleAssignments>[] = [];
	const preservableAssignments: Selectable<ScheduleAssignments>[] = [];

	for (const assignment of futureAssignments) {
		// Check if preceptor is unavailable
		if (unavailablePreceptorIds.has(assignment.preceptor_id)) {
			affectedAssignments.push(assignment);
			continue;
		}

		// Check if preceptor is unavailable on this specific date
		const availableDates = context.preceptorAvailability.get(assignment.preceptor_id);
		if (availableDates && !availableDates.has(assignment.date)) {
			affectedAssignments.push(assignment);
			continue;
		}

		// Check if assignment is in a blackout date
		if (context.blackoutDates.has(assignment.date)) {
			affectedAssignments.push(assignment);
			continue;
		}

		// Assignment appears valid - can be preserved
		preservableAssignments.push(assignment);
	}

	log.info('Affected assignments identified', {
		futureAssignmentsTotal: futureAssignments.length,
		affectedCount: affectedAssignments.length,
		preservableCount: preservableAssignments.length,
		unavailablePreceptorCount: unavailablePreceptorIds.size
	});

	return {
		affectedAssignments,
		preservableAssignments,
		unavailablePreceptorIds
	};
}

/**
 * Find replacement preceptor for an assignment
 *
 * Attempts to find an available preceptor who can teach the same clerkship
 * on the same date.
 *
 * @param assignment - Assignment that needs a new preceptor
 * @param context - Scheduling context
 * @param unavailablePreceptorIds - Set of preceptor IDs to exclude
 * @returns Preceptor ID if found, null otherwise
 */
export function findReplacementPreceptor(
	assignment: Selectable<ScheduleAssignments>,
	context: SchedulingContext,
	unavailablePreceptorIds: Set<string>
): string | null {
	// Find clerkship for this assignment
	const clerkship = context.clerkships.find((c) => c.id === assignment.clerkship_id);
	if (!clerkship) return null;

	// Find preceptors with matching specialty who are available
	for (const preceptor of context.preceptors) {
		// Skip if preceptor is unavailable
		if (unavailablePreceptorIds.has(preceptor.id!)) continue;

		// Skip if already assigned
		if (preceptor.id === assignment.preceptor_id) continue;

		// Note: Specialty matching removed - preceptors no longer have specialty field

		// Check if available on this date
		const availableDates = context.preceptorAvailability.get(preceptor.id!);
		if (!availableDates || !availableDates.has(assignment.date)) continue;

		// Check capacity on this date
		const assignmentsOnDate = context.assignmentsByDate.get(assignment.date) || [];
		const preceptorAssignmentsOnDate = assignmentsOnDate.filter(
			(a) => a.preceptorId === preceptor.id
		);
		if (preceptorAssignmentsOnDate.length >= preceptor.max_students) continue;

		// Found a suitable replacement
		return preceptor.id!;
	}

	return null;
}

/**
 * Apply minimal-change strategy to future assignments
 *
 * Attempts to preserve as many valid future assignments as possible,
 * only replacing assignments for preceptors who are no longer available.
 *
 * @param context - Scheduling context
 * @param preservableAssignments - Assignments that can be kept
 * @param affectedAssignments - Assignments that need replacement
 * @param unavailablePreceptorIds - Set of unavailable preceptor IDs
 * @returns Array of assignments to attempt (preserved + with replacements)
 */
export function applyMinimalChangeStrategy(
	context: SchedulingContext,
	preservableAssignments: Selectable<ScheduleAssignments>[],
	affectedAssignments: Selectable<ScheduleAssignments>[],
	unavailablePreceptorIds: Set<string>
): Assignment[] {
	const assignmentsToAttempt: Assignment[] = [];

	// Add all preservable assignments to context as if they were already assigned
	for (const assignment of preservableAssignments) {
		const preservedAssignment: Assignment = {
			studentId: assignment.student_id,
			preceptorId: assignment.preceptor_id,
			clerkshipId: assignment.clerkship_id,
			date: assignment.date
		};

		assignmentsToAttempt.push(preservedAssignment);

		// Update context to reflect this preserved assignment
		context.assignments.push(preservedAssignment);

		// Update tracking maps
		if (!context.assignmentsByDate.has(assignment.date)) {
			context.assignmentsByDate.set(assignment.date, []);
		}
		context.assignmentsByDate.get(assignment.date)!.push(preservedAssignment);

		if (!context.assignmentsByStudent.has(assignment.student_id)) {
			context.assignmentsByStudent.set(assignment.student_id, []);
		}
		context.assignmentsByStudent.get(assignment.student_id)!.push(preservedAssignment);

		if (!context.assignmentsByPreceptor.has(assignment.preceptor_id)) {
			context.assignmentsByPreceptor.set(assignment.preceptor_id, []);
		}
		context.assignmentsByPreceptor.get(assignment.preceptor_id)!.push(preservedAssignment);

		// Decrement student requirement for this clerkship
		const studentReqs = context.studentRequirements.get(assignment.student_id);
		if (studentReqs) {
			const currentDaysNeeded = studentReqs.get(assignment.clerkship_id) || 0;
			if (currentDaysNeeded > 0) {
				studentReqs.set(assignment.clerkship_id, currentDaysNeeded - 1);
			}
		}
	}

	// Try to find replacements for affected assignments
	for (const assignment of affectedAssignments) {
		const replacementPreceptorId = findReplacementPreceptor(
			assignment,
			context,
			unavailablePreceptorIds
		);

		if (replacementPreceptorId) {
			const replacedAssignment: Assignment = {
				studentId: assignment.student_id,
				preceptorId: replacementPreceptorId,
				clerkshipId: assignment.clerkship_id,
				date: assignment.date
			};
			assignmentsToAttempt.push(replacedAssignment);
			// Note: Don't add to context yet - let the engine validate and add it
		}
		// If no replacement found, the engine will try to schedule this student later
	}

	return assignmentsToAttempt;
}

/**
 * Prepare scheduling context for regeneration
 *
 * Fetches past assignments, credits them toward requirements, and optionally
 * applies minimal-change strategy to preserve valid future assignments.
 *
 * @param db - Database connection
 * @param context - Scheduling context
 * @param regenerateFromDate - Date to start regenerating from
 * @param endDate - End date of schedule
 * @param strategy - Regeneration strategy to use
 * @returns Prepared context with credited requirements and optional preserved assignments
 */
export async function prepareRegenerationContext(
	db: Kysely<DB>,
	context: SchedulingContext,
	regenerateFromDate: string,
	endDate: string,
	strategy: RegenerationStrategy
): Promise<{
	creditResult: RequirementCreditResult;
	preservedAssignments: number;
	affectedAssignments: number;
}> {
	log.debug('Preparing regeneration context', {
		regenerateFromDate,
		endDate,
		strategy,
		studentCount: context.students.length,
		preceptorCount: context.preceptors.length
	});

	// Get all past assignments (before regeneration date)
	const startDate = context.startDate || '1900-01-01'; // Fallback to very old date
	const pastAssignments = await getAssignmentsByDateRange(
		db,
		startDate,
		regenerateFromDate
	).then((assignments) =>
		assignments.filter((a) => a.date < regenerateFromDate)
	);

	// Credit past assignments toward student requirements
	const creditResult = creditPastAssignmentsToRequirements(context, pastAssignments);

	let preservedAssignments = 0;
	let affectedAssignments = 0;

	// Apply strategy-specific logic
	if (strategy === 'minimal-change') {
		const affected = await identifyAffectedAssignments(
			db,
			context,
			regenerateFromDate,
			endDate
		);

		preservedAssignments = affected.preservableAssignments.length;
		affectedAssignments = affected.affectedAssignments.length;

		// Apply minimal-change strategy to preserve valid assignments
		applyMinimalChangeStrategy(
			context,
			affected.preservableAssignments,
			affected.affectedAssignments,
			affected.unavailablePreceptorIds
		);
	}
	// For 'full-reoptimize', we don't preserve any future assignments

	log.info('Regeneration context prepared', {
		strategy,
		pastAssignmentsCount: creditResult.totalPastAssignments,
		preservedAssignments,
		affectedAssignments,
		studentsWithProgress: creditResult.creditsByStudent.size
	});

	return {
		creditResult,
		preservedAssignments,
		affectedAssignments
	};
}

/**
 * Result of impact analysis for regeneration preview
 */
export interface RegenerationImpact {
	// Past assignments
	pastAssignments: Selectable<ScheduleAssignments>[];
	pastAssignmentsCount: number;

	// Future assignments to be deleted
	futureAssignmentsToDelete: Selectable<ScheduleAssignments>[];
	deletedCount: number;

	// Future assignments that can be preserved (minimal-change only)
	preservableAssignments: Selectable<ScheduleAssignments>[];
	preservedCount: number;

	// Future assignments affected by unavailability (minimal-change only)
	affectedAssignments: Selectable<ScheduleAssignments>[];
	affectedCount: number;

	// Assignments that can find replacements
	replaceableAssignments: Array<{
		original: Selectable<ScheduleAssignments>;
		replacementPreceptorId: string | null;
	}>;

	// Students with past progress
	studentProgress: Array<{
		studentId: string;
		clerkshipId: string;
		completedDays: number;
		remainingDays: number;
	}>;

	// Summary
	summary: {
		strategy: RegenerationStrategy;
		regenerateFromDate: string;
		totalAssignmentsImpacted: number;
		willPreservePast: boolean;
		willPreserveFuture: boolean;
	};
}

/**
 * Analyze the impact of schedule regeneration without making changes
 * This is used for preview/dry-run mode
 */
export async function analyzeRegenerationImpact(
	db: Kysely<DB>,
	context: SchedulingContext,
	regenerateFromDate: string,
	endDate: string,
	strategy: RegenerationStrategy
): Promise<RegenerationImpact> {
	log.debug('Analyzing regeneration impact', {
		regenerateFromDate,
		endDate,
		strategy
	});

	// Get all existing assignments
	const assignments = await getAssignmentsByDateRange(db, context.startDate, endDate);

	// Separate past and future assignments
	const pastAssignments = assignments.filter((a) => a.date < regenerateFromDate);
	const futureAssignments = assignments.filter((a) => a.date >= regenerateFromDate);

	// Calculate student progress from past assignments
	const studentProgress: RegenerationImpact['studentProgress'] = [];
	const progressMap = new Map<string, Map<string, number>>();

	for (const assignment of pastAssignments) {
		if (!progressMap.has(assignment.student_id)) {
			progressMap.set(assignment.student_id, new Map());
		}
		const studentMap = progressMap.get(assignment.student_id)!;
		const currentCount = studentMap.get(assignment.clerkship_id) || 0;
		studentMap.set(assignment.clerkship_id, currentCount + 1);
	}

	// Build student progress array
	for (const [studentId, clerkshipsMap] of Array.from(progressMap.entries())) {
		for (const [clerkshipId, completedDays] of Array.from(clerkshipsMap.entries())) {
			const totalRequired =
				context.clerkships.find((c) => c.id === clerkshipId)?.required_days || 0;
			studentProgress.push({
				studentId,
				clerkshipId,
				completedDays,
				remainingDays: Math.max(0, totalRequired - completedDays)
			});
		}
	}

	let preservableAssignments: Selectable<ScheduleAssignments>[] = [];
	let affectedAssignments: Selectable<ScheduleAssignments>[] = [];
	let replaceableAssignments: RegenerationImpact['replaceableAssignments'] = [];

	// Strategy-specific analysis
	if (strategy === 'minimal-change') {
		const affected = await identifyAffectedAssignments(
			db,
			context,
			regenerateFromDate,
			endDate
		);

		preservableAssignments = affected.preservableAssignments;
		affectedAssignments = affected.affectedAssignments;

		// Check which affected assignments can find replacements
		for (const assignment of affected.affectedAssignments) {
			const replacementId = findReplacementPreceptor(
				assignment,
				context,
				affected.unavailablePreceptorIds
			);
			replaceableAssignments.push({
				original: assignment,
				replacementPreceptorId: replacementId
			});
		}
	}

	// Calculate totals
	const totalImpacted =
		futureAssignments.length - (strategy === 'minimal-change' ? preservableAssignments.length : 0);

	log.info('Regeneration impact analyzed', {
		strategy,
		regenerateFromDate,
		pastAssignmentsCount: pastAssignments.length,
		futureAssignmentsCount: futureAssignments.length,
		preservableCount: preservableAssignments.length,
		affectedCount: affectedAssignments.length,
		totalImpacted,
		studentsWithProgress: studentProgress.length
	});

	return {
		pastAssignments,
		pastAssignmentsCount: pastAssignments.length,
		futureAssignmentsToDelete: futureAssignments,
		deletedCount: futureAssignments.length,
		preservableAssignments,
		preservedCount: preservableAssignments.length,
		affectedAssignments,
		affectedCount: affectedAssignments.length,
		replaceableAssignments,
		studentProgress,
		summary: {
			strategy,
			regenerateFromDate,
			totalAssignmentsImpacted: totalImpacted,
			willPreservePast: true,
			willPreserveFuture: strategy === 'minimal-change' && preservableAssignments.length > 0
		}
	};
}

/**
 * Result of completion context preparation
 */
export interface CompletionContextResult {
	totalExistingAssignments: number;
	studentsWithUnmetRequirements: string[];
	unmetRequirementsByStudent: Map<string, Map<string, number>>;
}

/**
 * Prepare context for completion-only generation
 *
 * Unlike minimal-change, this strategy:
 * - Keeps 100% of existing assignments (no validation)
 * - Only generates for students with unmet requirements
 * - Uses bypassed constraints only for new assignments
 *
 * @param db - Database connection
 * @param context - Scheduling context
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @returns Result with existing assignments count and incomplete students
 */
export async function prepareCompletionContext(
	db: Kysely<DB>,
	context: SchedulingContext,
	startDate: string,
	endDate: string
): Promise<CompletionContextResult> {
	log.debug('Preparing completion-only context', {
		startDate,
		endDate,
		studentCount: context.students.length
	});

	// Get ALL existing assignments (no date filtering)
	const allExistingAssignments = await getAssignmentsByDateRange(db, startDate, endDate);

	log.debug('Loaded existing assignments', {
		count: allExistingAssignments.length
	});

	// Credit ALL existing work to requirements
	creditPastAssignmentsToRequirements(context, allExistingAssignments);

	// Add ALL existing assignments to context
	// This makes the engine aware of them and work around them
	for (const assignment of allExistingAssignments) {
		const preservedAssignment: Assignment = {
			studentId: assignment.student_id,
			preceptorId: assignment.preceptor_id,
			clerkshipId: assignment.clerkship_id,
			date: assignment.date,
			siteId: assignment.site_id || undefined
		};

		// Add to context
		context.assignments.push(preservedAssignment);

		// Update tracking maps
		if (!context.assignmentsByDate.has(assignment.date)) {
			context.assignmentsByDate.set(assignment.date, []);
		}
		context.assignmentsByDate.get(assignment.date)!.push(preservedAssignment);

		if (!context.assignmentsByStudent.has(assignment.student_id)) {
			context.assignmentsByStudent.set(assignment.student_id, []);
		}
		context.assignmentsByStudent.get(assignment.student_id)!.push(preservedAssignment);

		if (!context.assignmentsByPreceptor.has(assignment.preceptor_id)) {
			context.assignmentsByPreceptor.set(assignment.preceptor_id, []);
		}
		context.assignmentsByPreceptor.get(assignment.preceptor_id)!.push(preservedAssignment);
	}

	// Identify students with unmet requirements
	const studentsWithUnmetRequirements: string[] = [];
	const unmetRequirementsByStudent = new Map<string, Map<string, number>>();

	for (const student of context.students) {
		const requirements = context.studentRequirements.get(student.id!);
		if (!requirements) continue;

		const unmetForStudent = new Map<string, number>();
		let hasUnmet = false;

		for (const [clerkshipId, daysNeeded] of requirements.entries()) {
			if (daysNeeded > 0) {
				hasUnmet = true;
				unmetForStudent.set(clerkshipId, daysNeeded);
			}
		}

		if (hasUnmet) {
			studentsWithUnmetRequirements.push(student.id!);
			unmetRequirementsByStudent.set(student.id!, unmetForStudent);
		}
	}

	const completionRate =
		context.students.length > 0
			? ((context.students.length - studentsWithUnmetRequirements.length) /
					context.students.length) *
				100
			: 100;

	log.info('Completion context prepared', {
		totalExistingAssignments: allExistingAssignments.length,
		studentsWithGaps: studentsWithUnmetRequirements.length,
		totalStudents: context.students.length,
		completionRate: completionRate.toFixed(1) + '%'
	});

	return {
		totalExistingAssignments: allExistingAssignments.length,
		studentsWithUnmetRequirements,
		unmetRequirementsByStudent
	};
}
