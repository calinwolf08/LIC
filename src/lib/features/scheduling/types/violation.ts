import type { Assignment } from './assignment';

/**
 * Record of a single constraint violation
 */
export interface ConstraintViolation {
	/**
	 * Name of the constraint that was violated
	 */
	constraintName: string;

	/**
	 * When the violation occurred
	 */
	timestamp: Date;

	/**
	 * The assignment that violated the constraint
	 */
	assignment: Assignment;

	/**
	 * Human-readable explanation of why it was violated
	 */
	reason: string;

	/**
	 * Additional constraint-specific metadata for debugging
	 */
	metadata?: Record<string, any>;
}

/**
 * Aggregated statistics for violations of a specific constraint
 */
export interface ViolationStats {
	/**
	 * Name of the constraint
	 */
	constraintName: string;

	/**
	 * Total number of times this constraint was violated
	 */
	count: number;

	/**
	 * All individual violations of this constraint
	 */
	violations: ConstraintViolation[];

	/**
	 * Summary of what was affected by these violations
	 */
	summary?: {
		/**
		 * Unique students affected by violations
		 */
		affectedStudents: Set<string>;

		/**
		 * Unique dates where violations occurred
		 */
		affectedDates: Set<string>;

		/**
		 * Unique preceptors involved in violations
		 */
		affectedPreceptors: Set<string>;
	};
}
