import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures preceptors are only assigned on days they have site-based availability
 *
 * Preceptors set their availability per site in the preceptor_availability table.
 * A preceptor is available on a date if they have a site assigned for that date.
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
		// preceptorAvailability is now Map<preceptorId, Map<date, siteId>>
		const dateToSite = context.preceptorAvailability.get(assignment.preceptorId);
		const siteOnDate = dateToSite?.get(assignment.date);
		const isValid = !!siteOnDate;

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
					totalAvailableDates: dateToSite?.size || 0,
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		return `Preceptor ${preceptor?.name} is not available on ${assignment.date}`;
	}

	/**
	 * Helper to get the site a preceptor is at on a specific date
	 * Returns undefined if the preceptor is not available on that date
	 */
	static getPreceptorSiteOnDate(
		context: SchedulingContext,
		preceptorId: string,
		date: string
	): string | undefined {
		return context.preceptorAvailability.get(preceptorId)?.get(date);
	}
}
