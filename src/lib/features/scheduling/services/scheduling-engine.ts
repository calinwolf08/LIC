import type { Selectable } from 'kysely';
import type {
	Students,
	Preceptors,
	Clerkships,
	PreceptorAvailability,
} from '$lib/db/types';
import type { Constraint, Assignment, SchedulingContext, ScheduleResult } from '../types';
import { ViolationTracker } from './violation-tracker';
import { buildSchedulingContext } from './context-builder';
import {
	getMostNeededClerkship,
	getStudentsNeedingAssignments,
	checkUnmetRequirements,
} from './requirement-tracker';
import { getSchedulingDates } from '../utils/date-utils';
import { getAvailablePreceptors } from '../utils/preceptor-matcher';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:scheduling:engine');

/**
 * Main scheduling engine using greedy algorithm with constraint validation
 *
 * Iterates through dates, attempting to assign students to preceptors
 * while satisfying all constraints. Tracks violations for analysis.
 */
export class SchedulingEngine {
	private constraints: Constraint[];
	private violationTracker: ViolationTracker;

	/**
	 * Create a new scheduling engine
	 *
	 * @param constraints - Array of constraints to validate assignments
	 */
	constructor(constraints: Constraint[]) {
		// Sort constraints by priority for efficient evaluation
		this.constraints = constraints.sort((a, b) => (a.priority || 99) - (b.priority || 99));
		this.violationTracker = new ViolationTracker();
	}

	/**
	 * Generate a schedule for all students
	 *
	 * @param students - All students to schedule
	 * @param preceptors - All available preceptors
	 * @param clerkships - All clerkship types with requirements
	 * @param blackoutDates - Array of blackout date strings
	 * @param preceptorAvailabilityRecords - Availability records from database
	 * @param startDate - Academic year start date (ISO format)
	 * @param endDate - Academic year end date (ISO format)
	 * @param bypassedConstraints - Set of constraint names to bypass (future feature)
	 * @param existingContext - Optional pre-built context (for regeneration with credited requirements)
	 * @returns Complete schedule result with assignments and violation analysis
	 */
	async generateSchedule(
		students: Selectable<Students>[],
		preceptors: Selectable<Preceptors>[],
		clerkships: Selectable<Clerkships>[],
		blackoutDates: string[],
		preceptorAvailabilityRecords: Selectable<PreceptorAvailability>[],
		startDate: string,
		endDate: string,
		bypassedConstraints: Set<string> = new Set(),
		existingContext?: SchedulingContext
	): Promise<ScheduleResult> {
		log.debug('Starting schedule generation', {
			studentCount: students.length,
			preceptorCount: preceptors.length,
			clerkshipCount: clerkships.length,
			startDate,
			endDate,
			blackoutDateCount: blackoutDates.length,
			bypassedConstraintsCount: bypassedConstraints.size,
			hasExistingContext: !!existingContext
		});

		// Clear violations from previous run
		this.violationTracker.clear();

		// Use existing context if provided, otherwise build new one
		const context = existingContext || buildSchedulingContext(
			students,
			preceptors,
			clerkships,
			blackoutDates,
			preceptorAvailabilityRecords,
			startDate,
			endDate
		);

		// Get all valid scheduling dates (excludes blackouts)
		const dates = getSchedulingDates(startDate, endDate, context.blackoutDates);

		// Greedy assignment: iterate through dates
		for (const date of dates) {
			// For each student who still needs assignments
			const studentsNeedingWork = getStudentsNeedingAssignments(context);

			for (const student of studentsNeedingWork) {
				// Find which clerkship this student needs most
				const clerkship = getMostNeededClerkship(student.id!, context);
				if (!clerkship) continue; // Student has met all requirements

				// Find available preceptors for this clerkship on this date
				const availablePreceptors = getAvailablePreceptors(clerkship, date, context);

				// Try to assign to a preceptor
				for (const preceptor of availablePreceptors) {
					const assignment: Assignment = {
						studentId: student.id!,
						preceptorId: preceptor.id!,
						clerkshipId: clerkship.id!,
						date,
					};

					// Validate against all constraints
					if (this.validateAssignment(assignment, context, bypassedConstraints)) {
						// Add assignment and update context
						this.addAssignment(assignment, context);
						break; // Move to next student
					}
				}
			}
		}

		// Check if all requirements met
		const unmetRequirements = checkUnmetRequirements(context);
		const topViolations = this.violationTracker.getTopViolations(10);

		const success = unmetRequirements.length === 0;

		log.info('Schedule generation completed', {
			success,
			totalAssignments: context.assignments.length,
			totalViolations: this.violationTracker.getTotalViolations(),
			unmetRequirementsCount: unmetRequirements.length,
			datesProcessed: dates.length
		});

		return {
			assignments: context.assignments,
			success,
			unmetRequirements,
			violationStats: topViolations,
			violationTracker: this.violationTracker,
			summary: {
				totalAssignments: context.assignments.length,
				totalViolations: this.violationTracker.getTotalViolations(),
				mostBlockingConstraints: topViolations.slice(0, 3).map((v) => v.constraintName),
			},
		};
	}

	/**
	 * Validates an assignment against all constraints (except bypassed ones)
	 *
	 * @param assignment - Proposed assignment
	 * @param context - Scheduling context
	 * @param bypassedConstraints - Set of constraint names to skip
	 * @returns true if all constraints satisfied
	 */
	private validateAssignment(
		assignment: Assignment,
		context: SchedulingContext,
		bypassedConstraints: Set<string>
	): boolean {
		for (const constraint of this.constraints) {
			// Skip if constraint is bypassed
			if (bypassedConstraints.has(constraint.name)) {
				continue;
			}

			// Validate and track violations
			if (!constraint.validate(assignment, context, this.violationTracker)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Adds assignment to context and updates all tracking structures
	 *
	 * @param assignment - Assignment to add
	 * @param context - Scheduling context to update
	 */
	private addAssignment(assignment: Assignment, context: SchedulingContext): void {
		// Add to main assignments array
		context.assignments.push(assignment);

		// Update assignmentsByDate map
		if (!context.assignmentsByDate.has(assignment.date)) {
			context.assignmentsByDate.set(assignment.date, []);
		}
		context.assignmentsByDate.get(assignment.date)!.push(assignment);

		// Update assignmentsByStudent map
		if (!context.assignmentsByStudent.has(assignment.studentId)) {
			context.assignmentsByStudent.set(assignment.studentId, []);
		}
		context.assignmentsByStudent.get(assignment.studentId)!.push(assignment);

		// Update assignmentsByPreceptor map
		if (!context.assignmentsByPreceptor.has(assignment.preceptorId)) {
			context.assignmentsByPreceptor.set(assignment.preceptorId, []);
		}
		context.assignmentsByPreceptor.get(assignment.preceptorId)!.push(assignment);

		// Decrement student requirement
		const studentReqs = context.studentRequirements.get(assignment.studentId)!;
		const remaining = studentReqs.get(assignment.clerkshipId)! - 1;
		studentReqs.set(assignment.clerkshipId, remaining);
	}
}
