import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures preceptors do not exceed their maximum student capacity
 *
 * Each preceptor has a max_students limit (typically 1 for MVP).
 * This constraint can potentially be bypassed if urgent.
 */
export class PreceptorCapacityConstraint implements Constraint {
	name = 'PreceptorCapacity';
	priority = 2;
	bypassable = true; // Could potentially be bypassed if urgent

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		if (!preceptor) return false;

		const preceptorAssignmentsOnDate =
			context.assignmentsByDate
				.get(assignment.date)
				?.filter((a) => a.preceptorId === assignment.preceptorId) || [];

		const isValid = preceptorAssignmentsOnDate.length < preceptor.max_students;

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					preceptorName: preceptor.name,
					preceptorId: preceptor.id,
					studentName: student?.name,
					date: assignment.date,
					currentCapacity: preceptorAssignmentsOnDate.length,
					maxCapacity: preceptor.max_students,
					studentsAlreadyAssigned: preceptorAssignmentsOnDate.map((a) => ({
						studentId: a.studentId,
						studentName: context.students.find((s) => s.id === a.studentId)?.name,
					})),
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		return `Preceptor ${preceptor?.name} is at capacity (${preceptor?.max_students}) on ${assignment.date}`;
	}
}
