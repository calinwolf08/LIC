import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';
import { PreceptorAvailabilityConstraint } from './preceptor-availability.constraint';

/**
 * Enforces site capacity limits
 *
 * Sites can have capacity rules that limit:
 * - Maximum students per day
 * - Maximum students per year
 * - Maximum students per block (for inpatient)
 * - Maximum blocks per year (for inpatient)
 *
 * These limits can be global or specific to a clerkship/requirement type.
 *
 * The preceptor's site for a given date is determined by their availability
 * schedule (preceptor_availability table with site_id).
 */
export class SiteCapacityConstraint implements Constraint {
	name = 'SiteCapacity';
	priority = 4; // Check after continuity constraints
	bypassable = true; // Can be bypassed in emergencies

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies if context has site capacity data
		if (!context.siteCapacityRules) {
			return true; // Skip check if capacity tracking not enabled
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

		// Get applicable capacity rules for this site
		const siteRules = context.siteCapacityRules.get(siteId);
		if (!siteRules || siteRules.length === 0) {
			return true; // No capacity rules defined
		}

		// Find most specific rule: clerkship-specific > requirement-type-specific > global
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
		const requirementType = clerkship?.clerkship_type;
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);

		const applicableRule =
			siteRules.find((r) => r.clerkship_id === assignment.clerkshipId) ||
			siteRules.find((r) => r.requirement_type === requirementType && !r.clerkship_id) ||
			siteRules.find((r) => !r.clerkship_id && !r.requirement_type);

		if (!applicableRule) {
			return true; // No applicable rule found
		}

		// Check daily capacity
		const dailyViolation = this.checkDailyCapacity(
			assignment,
			context,
			siteId,
			applicableRule.max_students_per_day
		);
		if (dailyViolation) {
			violationTracker.recordViolation(
				this.name,
				assignment,
				dailyViolation,
				{
					studentName: context.students.find((s) => s.id === assignment.studentId)?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor?.name,
					siteName: context.sites?.find((s) => s.id === siteId)?.name || siteId,
					siteId,
					date: assignment.date,
					violationType: 'daily_capacity'
				}
			);
			return false;
		}

		// Check yearly capacity
		const yearlyViolation = this.checkYearlyCapacity(
			assignment,
			context,
			siteId,
			applicableRule.max_students_per_year
		);
		if (yearlyViolation) {
			violationTracker.recordViolation(
				this.name,
				assignment,
				yearlyViolation,
				{
					studentName: context.students.find((s) => s.id === assignment.studentId)?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor?.name,
					siteName: context.sites?.find((s) => s.id === siteId)?.name || siteId,
					siteId,
					date: assignment.date,
					violationType: 'yearly_capacity'
				}
			);
			return false;
		}

		// Check block capacity (if applicable)
		if (applicableRule.max_students_per_block || applicableRule.max_blocks_per_year) {
			const blockViolation = this.checkBlockCapacity(
				assignment,
				context,
				siteId,
				applicableRule.max_students_per_block,
				applicableRule.max_blocks_per_year
			);
			if (blockViolation) {
				violationTracker.recordViolation(
					this.name,
					assignment,
					blockViolation,
					{
						studentName: context.students.find((s) => s.id === assignment.studentId)?.name,
						clerkshipName: clerkship?.name,
						preceptorName: preceptor?.name,
						siteName: context.sites?.find((s) => s.id === siteId)?.name || siteId,
						siteId,
						date: assignment.date,
						violationType: 'block_capacity'
					}
				);
				return false;
			}
		}

		return true;
	}

	private checkDailyCapacity(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		maxStudentsPerDay: number
	): string | null {
		// Count students already assigned to this site on this date
		// We check each assignment's preceptor's site on that assignment's date
		const assignmentsOnDate = Array.from(context.assignmentsByStudent.values())
			.flat()
			.filter((a) => {
				if (a.date !== assignment.date) return false;
				// Get the site the assignment's preceptor was at on that date
				const assignmentSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
					context,
					a.preceptorId,
					a.date
				);
				return assignmentSiteId === siteId;
			});

		const currentCount = assignmentsOnDate.length;

		if (currentCount >= maxStudentsPerDay) {
			const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId;
			return `Site ${siteName} has reached daily capacity (${maxStudentsPerDay} students) on ${assignment.date}.`;
		}

		return null;
	}

	private checkYearlyCapacity(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		maxStudentsPerYear: number
	): string | null {
		// Get unique students assigned to this site across all dates
		const uniqueStudents = new Set<string>();

		for (const [studentId, assignments] of context.assignmentsByStudent.entries()) {
			const hasAssignmentAtSite = assignments.some((a) => {
				// Get the site the assignment's preceptor was at on that date
				const assignmentSiteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
					context,
					a.preceptorId,
					a.date
				);
				return assignmentSiteId === siteId;
			});

			if (hasAssignmentAtSite) {
				uniqueStudents.add(studentId);
			}
		}

		// Add current student if not already counted
		uniqueStudents.add(assignment.studentId);

		if (uniqueStudents.size > maxStudentsPerYear) {
			const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId;
			return `Site ${siteName} has reached yearly capacity (${maxStudentsPerYear} unique students).`;
		}

		return null;
	}

	private checkBlockCapacity(
		assignment: Assignment,
		context: SchedulingContext,
		siteId: string,
		maxStudentsPerBlock: number | null,
		maxBlocksPerYear: number | null
	): string | null {
		// This is a simplified check - full implementation would require block detection logic
		// For now, we'll just check if max_students_per_block is defined
		if (maxStudentsPerBlock) {
			// Would need to identify which block this assignment belongs to
			// and count students in that block
			// Placeholder for now
		}

		if (maxBlocksPerYear) {
			// Would need to count total blocks at this site
			// Placeholder for now
		}

		return null;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		const siteId = PreceptorAvailabilityConstraint.getPreceptorSiteOnDate(
			context,
			assignment.preceptorId,
			assignment.date
		);
		const siteName = context.sites?.find((s) => s.id === siteId)?.name || siteId || 'Unknown';

		return `Site ${siteName} capacity exceeded. Cannot assign ${student?.name} to ${preceptor?.name} for ${clerkship?.name} on ${assignment.date}.`;
	}
}
