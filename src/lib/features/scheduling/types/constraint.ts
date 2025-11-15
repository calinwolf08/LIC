import type { Assignment } from './assignment';
import type { SchedulingContext } from './scheduling-context';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Interface for all scheduling constraints
 *
 * Constraints validate whether a proposed assignment is allowed.
 * They record violations when invalid assignments are attempted.
 */
export interface Constraint {
	/**
	 * Unique identifier for this constraint
	 */
	name: string;

	/**
	 * Validates whether a proposed assignment satisfies this constraint
	 *
	 * @param assignment - The proposed student-preceptor-clerkship-date assignment
	 * @param context - Current scheduling state and master data
	 * @param violationTracker - Tracker to record violations
	 * @returns true if constraint is satisfied, false if violated
	 */
	validate(
		assignment: Assignment,
		context: SchedulingContext,
		violationTracker: ViolationTracker
	): boolean;

	/**
	 * Returns human-readable error message when constraint is violated
	 * Used for debugging and reporting
	 *
	 * @param assignment - The assignment that violated the constraint
	 * @param context - Current scheduling context
	 * @returns Error message explaining the violation
	 */
	getViolationMessage(assignment: Assignment, context: SchedulingContext): string;

	/**
	 * Priority for evaluation order (lower = checked first)
	 * Constraints with lower priority are evaluated before higher priority.
	 * This allows failing fast on cheap constraints.
	 *
	 * Default: 99 (low priority)
	 */
	priority?: number;

	/**
	 * Can this constraint be bypassed by the user?
	 *
	 * If true, users can choose to ignore violations of this constraint
	 * to improve scheduling success rate (future feature).
	 *
	 * Default: false (cannot bypass)
	 */
	bypassable?: boolean;
}
