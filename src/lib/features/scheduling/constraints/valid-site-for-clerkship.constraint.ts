import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';
import { PreceptorAvailabilityConstraint } from './preceptor-availability.constraint';

/**
 * Ensures assignments are only made to valid sites for the clerkship
 *
 * Clerkships are offered at specific sites through the clerkship_sites table.
 * Preceptors must be associated with a clerkship at a specific site through
 * the preceptor_site_clerkships table. This constraint ensures students are
 * only assigned to preceptors at sites where the clerkship is offered.
 *
 * The preceptor's site for a given date is determined by their availability
 * schedule (preceptor_availability table with site_id).
 */
export class ValidSiteForClerkshipConstraint implements Constraint {
	name = 'ValidSiteForClerkship';
	priority = 2; // Check after availability (need to know which site)
	bypassable = false; // Cannot bypass - must be at valid site

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies if context has site association data
		// Note: clerkshipSites is no longer used - team membership is authoritative
		if (!context.preceptorClerkshipAssociations) {
			return true; // Skip check if site associations not loaded
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

		// For electives, check site-elective associations
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		if (clerkship?.clerkship_type === 'elective') {
			return this.validateElectiveSite(assignment, context, siteId, violationTracker);
		}

		// For inpatient/outpatient, check if the clerkship is offered at this site
		return this.validateClerkshipSite(assignment, context, siteId, violationTracker);
	}

	private validateElectiveSite(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		violationTracker: ViolationTracker
	): boolean {
		// Check if site is associated with this elective
		if (!context.electiveSites || !assignment.electiveId) {
			return true; // No association data available or not an elective assignment
		}

		const electiveSiteSet = context.electiveSites.get(assignment.electiveId);
		const isValid = !!(electiveSiteSet && electiveSiteSet.has(siteId));

		if (!isValid) {
			this.recordViolation(assignment, context, siteId, violationTracker, true);
		}

		return isValid;
	}

	private validateClerkshipSite(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		violationTracker: ViolationTracker
	): boolean {
		// Check if preceptor is associated with this clerkship at this site
		// Note: Team membership is now authoritative for preceptor-clerkship associations.
		// The preceptor_site_clerkships table was dropped. When team-based constraint
		// checking is implemented, it should:
		// 1. Get preceptor's team(s) from team_members
		// 2. Check if team handles the clerkship (team_clerkships)
		// 3. Check if team operates at the site (team_sites)
		if (!context.preceptorClerkshipAssociations) {
			// No association data available - allow assignment
			// TODO: Implement team-based association checking
			return true;
		}

		// Check three-way association: preceptor + site + clerkship
		const preceptorAssociations = context.preceptorClerkshipAssociations.get(
			assignment.preceptorId
		);

		if (!preceptorAssociations) {
			this.recordViolation(assignment, context, siteId, violationTracker, false);
			return false;
		}

		const siteClerkships = preceptorAssociations.get(siteId);
		const isValid = !!(siteClerkships && siteClerkships.has(assignment.clerkshipId));

		if (!isValid) {
			this.recordViolation(assignment, context, siteId, violationTracker, false);
		}

		return isValid;
	}

	private recordViolation(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		violationTracker: ViolationTracker,
		isElective: boolean
	): void {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId;

		violationTracker.recordViolation(
			this.name,
			assignment,
			isElective
				? this.getElectiveViolationMessage(assignment, context, siteId)
				: this.getViolationMessage(assignment, context, siteId),
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

		return `${preceptor?.name} at ${siteName} is not authorized for ${clerkship?.name}. Cannot assign ${student?.name}.`;
	}

	private getElectiveViolationMessage(assignment: Assignment, context: SchedulingContext, siteId: string): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId;

		return `Elective ${clerkship?.name} is not offered at ${siteName}. Cannot assign ${student?.name} to ${preceptor?.name}.`;
	}
}
