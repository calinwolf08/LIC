import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures sites are available on the assignment date
 *
 * Sites can have specific availability dates marked unavailable.
 * This constraint prevents scheduling students at sites that are
 * closed or unavailable on particular dates.
 */
export class SiteAvailabilityConstraint implements Constraint {
	name = 'SiteAvailability';
	priority = 2; // Check early, after basic constraints
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

		// Get the preceptor being assigned
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		if (!preceptor || !preceptor.site_id) {
			// If preceptor doesn't have a site, we can't enforce this
			return true;
		}

		// Check if site is available on this date
		const siteAvailabilityMap = context.siteAvailability.get(preceptor.site_id);
		const isAvailable = siteAvailabilityMap?.get(assignment.date) ?? true;

		if (!isAvailable) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			// Get site name if available
			let siteName = preceptor.site_id;
			if (context.sites) {
				const site = context.sites.find((s) => s.id === preceptor.site_id);
				if (site) {
					siteName = site.name;
				}
			}

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor.name,
					siteName,
					date: assignment.date
				}
			);
		}

		return isAvailable;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		// Get site name if available
		let siteName = preceptor?.site_id || 'Unknown';
		if (context.sites && preceptor?.site_id) {
			const site = context.sites.find((s) => s.id === preceptor.site_id);
			if (site) {
				siteName = site.name;
			}
		}

		return `Site ${siteName} is not available on ${assignment.date}. Cannot assign ${student?.name} to ${preceptor?.name} for ${clerkship?.name}.`;
	}
}
