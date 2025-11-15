import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures no assignments are made on system-wide blackout dates
 *
 * Blackout dates are holidays, exam periods, or other dates when
 * no clinical activities should be scheduled.
 * This is a critical constraint that cannot be bypassed.
 */
export class BlackoutDateConstraint implements Constraint {
	name = 'BlackoutDate';
	priority = 1; // Check early, very cheap
	bypassable = false; // System-wide blackouts cannot be bypassed

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		const isValid = !context.blackoutDates.has(assignment.date);

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					date: assignment.date,
					studentName: student?.name,
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		return `${assignment.date} is a blackout date (system-wide closure)`;
	}
}
