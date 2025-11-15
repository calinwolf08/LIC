import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students are not double-booked on the same date
 *
 * A student can only be assigned to one preceptor per day.
 * This is a critical constraint that cannot be bypassed.
 */
export class NoDoubleBookingConstraint implements Constraint {
	name = 'NoDoubleBooking';
	priority = 1; // Check early, cheap to evaluate
	bypassable = false; // Critical constraint

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		const studentAssignmentsOnDate =
			context.assignmentsByDate
				.get(assignment.date)
				?.filter((a) => a.studentId === assignment.studentId) || [];

		const isValid = studentAssignmentsOnDate.length === 0;

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const existingAssignment = studentAssignmentsOnDate[0];
			const existingPreceptor = context.preceptors.find(
				(p) => p.id === existingAssignment.preceptorId
			);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					date: assignment.date,
					conflictingPreceptorId: existingAssignment.preceptorId,
					conflictingPreceptorName: existingPreceptor?.name,
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const student = context.students.find((s) => s.id === assignment.studentId);
		return `Student ${student?.name} is already assigned on ${assignment.date}`;
	}
}
