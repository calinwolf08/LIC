import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures students have completed onboarding before assignment to a health system
 *
 * Students must complete orientation/onboarding at a health system
 * before being assigned to any preceptor at that health system.
 * This is a critical safety and compliance requirement.
 */
export class StudentOnboardingConstraint implements Constraint {
	name = 'StudentOnboarding';
	priority = 2; // Check early, after basic constraints
	bypassable = false; // Cannot bypass onboarding requirements

	constructor(
		private requirementId: string,
		private clerkshipId: string
	) {}

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies if context has onboarding data
		if (!context.studentOnboarding) {
			return true; // Skip check if onboarding tracking not enabled
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

		// Check if student has completed onboarding at this health system
		const studentOnboardedSystems = context.studentOnboarding.get(assignment.studentId);
		const isOnboarded =
			studentOnboardedSystems && studentOnboardedSystems.has(preceptor.health_system_id);

		if (!isOnboarded) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			// Get health system name if available
			let healthSystemName = preceptor.health_system_id;
			if (context.healthSystems) {
				const healthSystem = context.healthSystems.find(
					(hs) => hs.id === preceptor.health_system_id
				);
				if (healthSystem) {
					healthSystemName = healthSystem.name;
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
					healthSystem: healthSystemName,
					date: assignment.date
				}
			);
		}

		return isOnboarded || false;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		// Get health system name if available
		let healthSystemName = preceptor?.health_system_id || 'Unknown';
		if (context.healthSystems && preceptor?.health_system_id) {
			const healthSystem = context.healthSystems.find(
				(hs) => hs.id === preceptor.health_system_id
			);
			if (healthSystem) {
				healthSystemName = healthSystem.name;
			}
		}

		return `Student ${student?.name} has not completed onboarding at ${healthSystemName}. Cannot assign to ${preceptor?.name} for ${clerkship?.name}.`;
	}
}
