import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students stay at the same site throughout a clerkship requirement
 *
 * When a clerkship requirement has `require_same_site = true`, students must
 * complete all days of that requirement at the same site. This prevents
 * students from switching between sites mid-clerkship.
 */
export class SiteContinuityConstraint implements Constraint {
	name = 'SiteContinuity';
	priority = 3;
	bypassable = false;

	constructor(
		private requirementId: string,
		private clerkshipId: string,
		private requireSameSite: boolean
	) {}

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// If same site is not required, this constraint doesn't apply
		if (!this.requireSameSite) {
			return true;
		}

		// Only applies to assignments for this clerkship
		if (assignment.clerkshipId !== this.clerkshipId) {
			return true;
		}

		// Get the preceptor being assigned
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		if (!preceptor || !preceptor.site_id) {
			// If preceptor doesn't have a site, we can't enforce this
			return true;
		}

		// Get student's existing assignments for this clerkship
		const studentAssignments = context.assignmentsByStudent.get(assignment.studentId) || [];
		const clerkshipAssignments = studentAssignments.filter(
			(a) => a.clerkshipId === this.clerkshipId
		);

		// If this is the first assignment for this clerkship, it's valid
		if (clerkshipAssignments.length === 0) {
			return true;
		}

		// Get site of first assignment
		const firstAssignment = clerkshipAssignments[0];
		const firstPreceptor = context.preceptors.find((p) => p.id === firstAssignment.preceptorId);

		if (!firstPreceptor || !firstPreceptor.site_id) {
			// Can't determine site of first assignment
			return true;
		}

		// Check if sites match
		const isValid = preceptor.site_id === firstPreceptor.site_id;

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			// Get site names if available
			let currentSiteName = preceptor.site_id;
			let firstSiteName = firstPreceptor.site_id;

			if (context.sites) {
				const currentSite = context.sites.find((s) => s.id === preceptor.site_id);
				const firstSite = context.sites.find((s) => s.id === firstPreceptor.site_id);
				if (currentSite) currentSiteName = currentSite.name;
				if (firstSite) firstSiteName = firstSite.name;
			}

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor.name,
					currentSite: currentSiteName,
					firstSite: firstSiteName,
					date: assignment.date
				}
			);
		}

		return isValid;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		// Get student's existing assignments for this clerkship
		const studentAssignments = context.assignmentsByStudent.get(assignment.studentId) || [];
		const clerkshipAssignments = studentAssignments.filter(
			(a) => a.clerkshipId === this.clerkshipId
		);

		if (clerkshipAssignments.length > 0) {
			const firstAssignment = clerkshipAssignments[0];
			const firstPreceptor = context.preceptors.find((p) => p.id === firstAssignment.preceptorId);

			let currentSiteName = preceptor?.site_id || 'Unknown';
			let firstSiteName = firstPreceptor?.site_id || 'Unknown';

			if (context.sites) {
				const currentSite = context.sites.find((s) => s.id === preceptor?.site_id);
				const firstSite = context.sites.find((s) => s.id === firstPreceptor?.site_id);
				if (currentSite) currentSiteName = currentSite.name;
				if (firstSite) firstSiteName = firstSite.name;
			}

			return `Student ${student?.name} must stay at ${firstSiteName} for ${clerkship?.name}. Cannot assign to ${preceptor?.name} at ${currentSiteName}.`;
		}

		return `Site continuity violated for ${student?.name} in ${clerkship?.name}`;
	}
}
