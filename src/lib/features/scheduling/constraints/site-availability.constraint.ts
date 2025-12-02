import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';
import { PreceptorAvailabilityConstraint } from './preceptor-availability.constraint';

/**
 * Ensures sites are available on the assignment date
 *
 * Sites can have specific availability dates marked unavailable.
 * This constraint prevents scheduling students at sites that are
 * closed or unavailable on particular dates.
 *
 * The preceptor's site for a given date is determined by their availability
 * schedule (preceptor_availability table with site_id).
 */
export class SiteAvailabilityConstraint implements Constraint {
	name = 'SiteAvailability';
	priority = 3; // Check after preceptor availability (need to know which site)
	bypassable = false;

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies if context has site availability data
		if (!context.siteAvailability) {
			return true; // Skip check if site availability tracking not enabled
		}

		// Get the site the preceptor is at on this date
		const siteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			assignment.preceptorId,
			assignment.date
		);

		if (!siteId) {
			// Preceptor has no site on this date - let PreceptorAvailabilityConstraint handle this
			return true;
		}

		// Check if site is available on this date
		const siteAvailabilityMap = context.siteAvailability.get(siteId);
		const isAvailable = siteAvailabilityMap?.get(assignment.date) ?? true;

		if (!isAvailable) {
			const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
			const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId;

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context, siteId),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor?.name,
					siteName,
					siteId,
					date: assignment.date
				}
			);
		}

		return isAvailable;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext, siteId?: string): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		// If siteId not provided, look it up from availability
		const effectiveSiteId = siteId || PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			assignment.preceptorId,
			assignment.date
		);
		const siteName = context.sites?.find((s) => s.id === effectiveSiteId)?.name || effectiveSiteId || 'Unknown';

		return `Site ${siteName} is not available on ${assignment.date}. Cannot assign ${student?.name} to ${preceptor?.name} for ${clerkship?.name}.`;
	}
}
