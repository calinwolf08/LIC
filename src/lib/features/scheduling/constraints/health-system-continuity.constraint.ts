import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students stay within the same health system for a clerkship
 *
 * Students should maintain continuity within a single health system unless
 * the requirement explicitly allows cross-system assignments.
 * This prevents students from switching between health systems mid-clerkship.
 */
export class HealthSystemContinuityConstraint implements Constraint {
	name = 'HealthSystemContinuity';
	priority = 3;
	bypassable = false;

	constructor(
		private requirementId: string,
		private clerkshipId: string,
		private allowCrossSystem: boolean
	) {}

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// If cross-system is allowed, this constraint doesn't apply
		if (this.allowCrossSystem) {
			return true;
		}

		// Only applies to assignments for this clerkship
		if (assignment.clerkshipId !== this.clerkshipId) {
			return true;
		}

		// Get the preceptor being assigned
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		if (!preceptor || !preceptor.health_system_id) {
			// If preceptor doesn't have health system, we can't enforce this
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

		// Get health system of first assignment
		const firstAssignment = clerkshipAssignments[0];
		const firstPreceptor = context.preceptors.find((p) => p.id === firstAssignment.preceptorId);

		if (!firstPreceptor || !firstPreceptor.health_system_id) {
			// Can't determine health system of first assignment
			return true;
		}

		// Check if health systems match
		const isValid = preceptor.health_system_id === firstPreceptor.health_system_id;

		if (!isValid) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			// Get health system names if available
			let currentHealthSystemName = preceptor.health_system_id;
			let firstHealthSystemName = firstPreceptor.health_system_id;

			if (context.healthSystems) {
				const currentHS = context.healthSystems.find(
					(hs) => hs.id === preceptor.health_system_id
				);
				const firstHS = context.healthSystems.find(
					(hs) => hs.id === firstPreceptor.health_system_id
				);
				if (currentHS) currentHealthSystemName = currentHS.name;
				if (firstHS) firstHealthSystemName = firstHS.name;
			}

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					clerkshipName: clerkship?.name,
					preceptorName: preceptor.name,
					currentHealthSystem: currentHealthSystemName,
					firstHealthSystem: firstHealthSystemName,
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

			let currentHealthSystemName = preceptor?.health_system_id || 'Unknown';
			let firstHealthSystemName = firstPreceptor?.health_system_id || 'Unknown';

			if (context.healthSystems) {
				const currentHS = context.healthSystems.find(
					(hs) => hs.id === preceptor?.health_system_id
				);
				const firstHS = context.healthSystems.find(
					(hs) => hs.id === firstPreceptor?.health_system_id
				);
				if (currentHS) currentHealthSystemName = currentHS.name;
				if (firstHS) firstHealthSystemName = firstHS.name;
			}

			return `Student ${student?.name} must stay within ${firstHealthSystemName} for ${clerkship?.name}. Cannot assign to ${preceptor?.name} at ${currentHealthSystemName}.`;
		}

		return `Health system continuity violated for ${student?.name} in ${clerkship?.name}`;
	}
}
