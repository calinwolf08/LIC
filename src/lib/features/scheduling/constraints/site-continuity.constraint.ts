import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';
import { PreceptorAvailabilityConstraint } from './preceptor-availability.constraint';

/**
 * Ensures students stay at the same site throughout a clerkship requirement
 *
 * When a clerkship requirement has `require_same_site = true`, students must
 * complete all days of that requirement at the same site. This prevents
 * students from switching between sites mid-clerkship.
 *
 * The site is determined by the preceptor's availability on each assignment date.
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

		// Get the site the preceptor is at on this date
		const currentSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			assignment.preceptorId,
			assignment.date
		);

		if (!currentSiteId) {
			// Preceptor has no site on this date - let PreceptorAvailabilityConstraint handle this
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
		const firstSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			firstAssignment.preceptorId,
			firstAssignment.date
		);

		if (!firstSiteId) {
			// Can't determine site of first assignment
			return true;
		}

		// Check if sites match
		const isValid = currentSiteId === firstSiteId;

		if (!isValid) {
			const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			const currentSiteName = context.sites?.find((s) => s.id === currentSiteId)?.name || currentSiteId;
			const firstSiteName = context.sites?.find((s) => s.id === firstSiteId)?.name || firstSiteId;

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor?.name,
					currentSite: currentSiteName,
					currentSiteId,
					firstSite: firstSiteName,
					firstSiteId,
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

		// Get the site the preceptor is at on this date
		const currentSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			assignment.preceptorId,
			assignment.date
		);

		// Get student's existing assignments for this clerkship
		const studentAssignments = context.assignmentsByStudent.get(assignment.studentId) || [];
		const clerkshipAssignments = studentAssignments.filter(
			(a) => a.clerkshipId === this.clerkshipId
		);

		if (clerkshipAssignments.length > 0) {
			const firstAssignment = clerkshipAssignments[0];
			const firstSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
				context,
				firstAssignment.preceptorId,
				firstAssignment.date
			);

			const currentSiteName = context.sites?.find((s) => s.id === currentSiteId)?.name || currentSiteId || 'Unknown';
			const firstSiteName = context.sites?.find((s) => s.id === firstSiteId)?.name || firstSiteId || 'Unknown';

			return `Student ${student?.name} must stay at ${firstSiteName} for ${clerkship?.name}. Cannot assign to ${preceptor?.name} at ${currentSiteName}.`;
		}

		return `Site continuity violated for ${student?.name} in ${clerkship?.name}`;
	}
}
