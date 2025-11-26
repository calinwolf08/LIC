import type { Constraint, Assignment, SchedulingContext } from '../types';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Specialty Match Constraint (Currently disabled)
 *
 * Note: This constraint is currently a no-op because the specialty field
 * has been removed from preceptors. The constraint is kept for potential
 * future use if specialty matching is re-implemented.
 *
 * Previously: Ensured preceptor specialty matches the clerkship specialty requirement.
 */
export class SpecialtyMatchConstraint implements Constraint {
	name = 'SpecialtyMatch';
	priority = 1;
	bypassable = true; // Now bypassable since not enforced

	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean {
		// Specialty matching is disabled - preceptors no longer have specialty field
		// Always return true (valid)
		return true;
	}

	getViolationMessage(assignment: Assignment, context: SchedulingContext): string {
		return 'Specialty matching is currently disabled';
	}
}
