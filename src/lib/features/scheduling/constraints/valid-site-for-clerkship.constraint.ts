import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures assignments are only made to valid sites for the clerkship
 *
 * Clerkships are offered at specific sites through the clerkship_sites table.
 * Preceptors must be associated with a clerkship at a specific site through
 * the preceptor_site_clerkships table. This constraint ensures students are
 * only assigned to preceptors at valid sites for the clerkship.
 */
export class ValidSiteForClerkshipConstraint implements Constraint {
	name = 'ValidSiteForClerkship';
	priority = 1; // Check very early
	bypassable = false; // Cannot bypass - must be at valid site

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies if context has site association data
		if (!context.clerkshipSites && !context.preceptorClerkshipAssociations) {
			return true; // Skip check if site associations not loaded
		}

		// Get the preceptor being assigned
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		if (!preceptor || !preceptor.site_id) {
			// If preceptor doesn't have a site, we can't enforce this
			return true;
		}

		// For electives, check site-elective associations
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		if (clerkship?.clerkship_type === 'elective') {
			return this.validateElectiveSite(assignment, context, preceptor, violationTracker);
		}

		// For inpatient/outpatient, check preceptor-site-clerkship associations
		return this.validateClerkshipSite(assignment, context, preceptor, violationTracker);
	}

	private validateElectiveSite(
		assignment: Assignment,
		context: SchedulingContext,
		preceptor: any,
		violationTracker: ViolationTracker
	): boolean {
		// Check if site is associated with this elective
		if (!context.siteElectiveAssociations) {
			return true; // No association data available
		}

		const siteElectives = context.siteElectiveAssociations.get(preceptor.site_id);
		const isValid =
			siteElectives && Array.from(siteElectives).some((req) => req === assignment.clerkshipId);

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			const siteName =
				context.sites?.find((s) => s.id === preceptor.site_id)?.name || preceptor.site_id;

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getElectiveViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor.name,
					siteName,
					date: assignment.date
				}
			);
		}

		return isValid;
	}

	private validateClerkshipSite(
		assignment: Assignment,
		context: SchedulingContext,
		preceptor: any,
		violationTracker: ViolationTracker
	): boolean {
		// Check if preceptor is associated with this clerkship at this site
		if (!context.preceptorClerkshipAssociations) {
			// Fallback to checking if site is valid for clerkship
			if (context.clerkshipSites) {
				const clerkshipSites = context.clerkshipSites.get(assignment.clerkshipId);
				const isValid = clerkshipSites && clerkshipSites.has(preceptor.site_id);

				if (!isValid) {
					this.recordViolation(assignment, context, preceptor, violationTracker);
				}

				return isValid;
			}
			return true; // No association data available
		}

		// Check three-way association: preceptor + site + clerkship
		const preceptorAssociations = context.preceptorClerkshipAssociations.get(
			assignment.preceptorId
		);

		if (!preceptorAssociations) {
			this.recordViolation(assignment, context, preceptor, violationTracker);
			return false;
		}

		const siteClerkships = preceptorAssociations.get(preceptor.site_id);
		const isValid = siteClerkships && siteClerkships.has(assignment.clerkshipId);

		if (!isValid) {
			this.recordViolation(assignment, context, preceptor, violationTracker);
		}

		return isValid;
	}

	private recordViolation(
		assignment: Assignment,
		context: SchedulingContext,
		preceptor: any,
		violationTracker: ViolationTracker
	): void {
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		const siteName =
			context.sites?.find((s) => s.id === preceptor.site_id)?.name || preceptor.site_id;

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

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		const siteName =
			context.sites?.find((s) => s.id === preceptor?.site_id)?.name ||
			preceptor?.site_id ||
			'Unknown';

		return `${preceptor?.name} at ${siteName} is not authorized for ${clerkship?.name}. Cannot assign ${student?.name}.`;
	}

	private getElectiveViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		const siteName =
			context.sites?.find((s) => s.id === preceptor?.site_id)?.name ||
			preceptor?.site_id ||
			'Unknown';

		return `Elective ${clerkship?.name} is not offered at ${siteName}. Cannot assign ${student?.name} to ${preceptor?.name}.`;
	}
}
