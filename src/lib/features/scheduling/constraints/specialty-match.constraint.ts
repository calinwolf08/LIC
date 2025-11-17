import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures preceptor specialty matches the clerkship specialty requirement
 *
 * Preceptors can only teach clerkships in their designated medical specialty.
 * This is a critical constraint that cannot be bypassed.
 */
export class SpecialtyMatchConstraint implements Constraint {
	name = 'SpecialtyMatch';
	priority = 1; // Check early
	bypassable = false; // Cannot teach outside specialty

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		if (!preceptor || !clerkship) return false;

		const isValid = preceptor.specialty === clerkship.specialty;

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					preceptorName: preceptor.name,
					preceptorSpecialty: preceptor.specialty,
					clerkshipName: clerkship.name,
					clerkshipSpecialty: clerkship.specialty,
					studentName: student?.name,
					date: assignment.date,
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		return `Preceptor ${preceptor?.name} (${preceptor?.specialty}) cannot teach ${clerkship?.name} (requires ${clerkship?.specialty})`;
	}
}
