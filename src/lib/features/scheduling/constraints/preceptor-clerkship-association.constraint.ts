import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Ensures preceptors are only assigned to clerkships/electives they're associated with
 *
 * Preceptors must be explicitly associated with a clerkship or elective
 * before they can supervise students in that rotation.
 * This ensures preceptors only teach in areas where they're qualified and approved.
 */
export class PreceptorClerkshipAssociationConstraint implements Constraint {
	name = 'PreceptorClerkshipAssociation';
	priority = 2; // Check early
	bypassable = false; // Cannot bypass association requirements

	constructor(
		private requirementId: string,
		private clerkshipId: string,
		private requirementType: 'inpatient' | 'outpatient' | 'elective'
	) {}

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Only applies to assignments for this clerkship
		if (assignment.clerkshipId !== this.clerkshipId) {
			return true;
		}

		// Determine which association map to use
		let isAssociated = false;

		if (this.requirementType === 'elective') {
			// For electives, check preceptor-elective associations
			if (context.preceptorElectiveAssociations) {
				const preceptorElectives =
					context.preceptorElectiveAssociations.get(assignment.preceptorId);
				isAssociated = preceptorElectives ? preceptorElectives.has(this.requirementId) : false;
			} else {
				// If no association data available, allow assignment
				return true;
			}
		} else {
			// For regular clerkships (inpatient/outpatient), check preceptor-clerkship associations
			if (context.preceptorClerkshipAssociations) {
				const preceptorClerkships =
					context.preceptorClerkshipAssociations.get(assignment.preceptorId);
				isAssociated = preceptorClerkships ? preceptorClerkships.has(this.clerkshipId) : false;
			} else {
				// If no association data available, allow assignment
				return true;
			}
		}

		if (!isAssociated) {
			const student = context.students.find((s) => s.id === assignment.studentId);
			const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
			const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

			violationTracker.recordViolation(
				this.name,
				assignment,
				this.getViolationMessage(assignment, context),
				{
					studentName: student?.name,
					preceptorName: preceptor?.name,
					clerkshipName: clerkship?.name,
					requirementType: this.requirementType,
					date: assignment.date
				}
			);
		}

		return isAssociated;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		const preceptor = context.preceptors.find((p) => p.id === assignment.preceptorId);
		const student = context.students.find((s) => s.id === assignment.studentId);
		const clerkship = context.clerkships.find((c) => c.id === assignment.clerkshipId);

		const rotationType = this.requirementType === 'elective' ? 'elective' : 'clerkship';

		return `Preceptor ${preceptor?.name} is not associated with ${rotationType} ${clerkship?.name}. Cannot assign student ${student?.name}.`;
	}
}
