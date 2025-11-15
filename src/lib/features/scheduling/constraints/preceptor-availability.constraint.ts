import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures preceptors are only assigned on days they marked as available
 *
 * Preceptors set their availability in the preceptor_availability table.
 * This constraint can be bypassed (ask preceptor to work on day off).
 */
export class PreceptorAvailabilityConstraint implements Constraint {
	name = 'PreceptorAvailability';
	priority = 1; // Check early
	bypassable = true; // Could ask preceptor to work on day off

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		const availableDates = context.preceptorAvailability.get(assignment.preceptorId);
		const isValid = availableDates?.has(assignment.date) || false;

		if (!isValid) {
			const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					preceptorName: preceptor?.name,
					preceptorId: preceptor?.id,
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					date: assignment.date,
					totalAvailableDates: availableDates?.size || 0,
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		return `Preceptor ${preceptor?.name} is not available on ${assignment.date}`;
	}
}
