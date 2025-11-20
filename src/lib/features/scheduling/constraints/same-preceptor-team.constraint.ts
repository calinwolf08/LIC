import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students work with the same preceptor team throughout a requirement
 *
 * When a clerkship requirement has `require_same_preceptor_team = true`,
 * students must work with preceptors from the same team throughout the
 * entire requirement. This ensures continuity of supervision and learning.
 */
export class SamePreceptorTeamConstraint implements Constraint {
	name = 'SamePreceptorTeam';
	priority = 3;
	bypassable = false;

	constructor(
		private requirementId: string,
		private clerkshipId: string,
		private requireSameTeam: boolean
	) {}

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// If same team is not required, this constraint doesn't apply
		if (!this.requireSameTeam) {
			return true;
		}

		// Only applies to assignments for this clerkship
		if (assignment.clerkshipId !== this.clerkshipId) {
			return true;
		}

		// Only applies if context has team data
		if (!context.preceptorTeams) {
			return true; // Skip check if team tracking not enabled
		}

		// Get the team(s) for the preceptor being assigned
		const preceptorTeams = context.preceptorTeams.get(assignment.preceptorId);

		// If preceptor is not on any team, allow the assignment
		// (team requirement only applies when teams exist)
		if (!preceptorTeams || preceptorTeams.size === 0) {
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

		// Get teams of first assignment's preceptor
		const firstAssignment = clerkshipAssignments[0];
		const firstPreceptorTeams = context.preceptorTeams.get(firstAssignment.preceptorId);

		// If first preceptor wasn't on a team, allow assignment
		if (!firstPreceptorTeams || firstPreceptorTeams.size === 0) {
			return true;
		}

		// Check if there's any team overlap between current and first preceptor
		const hasCommonTeam = Array.from(preceptorTeams).some((teamId) =>
			firstPreceptorTeams.has(teamId)
		);

		if (!hasCommonTeam) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);
			const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
			const firstPreceptor = context.preceptors.find((p) => p.id === firstAssignment.preceptorId);

			// Get team names if available
			const firstTeamId = Array.from(firstPreceptorTeams)[0];
			const currentTeamId = Array.from(preceptorTeams)[0];

			let firstTeamName = firstTeamId;
			let currentTeamName = currentTeamId;

			if (context.teams) {
				const firstTeam = context.teams.find((t) => t.id === firstTeamId);
				const currentTeam = context.teams.find((t) => t.id === currentTeamId);
				if (firstTeam) firstTeamName = firstTeam.name;
				if (currentTeam) currentTeamName = currentTeam.name;
			}

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor?.name,
					firstPreceptorName: firstPreceptor?.name,
					currentTeam: currentTeamName,
					firstTeam: firstTeamName,
					date: assignment.date
				}
			);
		}

		return hasCommonTeam;
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

		if (clerkshipAssignments.length > 0 && context.preceptorTeams) {
			const firstAssignment = clerkshipAssignments[0];
			const firstPreceptor = context.preceptors.find((p) => p.id === firstAssignment.preceptorId);
			const firstPreceptorTeams = context.preceptorTeams.get(firstAssignment.preceptorId);
			const currentPreceptorTeams = context.preceptorTeams.get(assignment.preceptorId);

			if (firstPreceptorTeams && firstPreceptorTeams.size > 0) {
				const firstTeamId = Array.from(firstPreceptorTeams)[0];
				let firstTeamName = firstTeamId;

				if (context.teams) {
					const firstTeam = context.teams.find((t) => t.id === firstTeamId);
					if (firstTeam) firstTeamName = firstTeam.name;
				}

				let currentTeamInfo = 'a different team';
				if (currentPreceptorTeams && currentPreceptorTeams.size > 0) {
					const currentTeamId = Array.from(currentPreceptorTeams)[0];
					let currentTeamName = currentTeamId;

					if (context.teams) {
						const currentTeam = context.teams.find((t) => t.id === currentTeamId);
						if (currentTeam) currentTeamName = currentTeam.name;
					}

					currentTeamInfo = `team ${currentTeamName}`;
				}

				return `Student ${student?.name} must stay with team ${firstTeamName} for ${clerkship?.name}. Cannot assign to ${preceptor?.name} on ${currentTeamInfo}.`;
			}
		}

		return `Preceptor team continuity violated for ${student?.name} in ${clerkship?.name}`;
	}
}
