import type { Assignment } from './assignment';
import type { ViolationStats } from './violation';
import type { ViolationTracker } from '../services/violation-tracker';

/**
 * Student requirement that was not fully met
 */
export interface UnmetRequirement {
	studentId: string;
	studentName: string;
	clerkshipId: string;
	clerkshipName: string;
	requiredDays: number;
	assignedDays: number;
	remainingDays: number;
}

/**
 * Result of the scheduling algorithm
 */
export interface ScheduleResult {
	/**
	 * All assignments that were successfully created
	 */
	assignments: Assignment[];

	/**
	 * Whether all student requirements were fully met
	 */
	success: boolean;

	/**
	 * Student requirements that were not fully satisfied
	 */
	unmetRequirements: UnmetRequirement[];

	/**
	 * Top constraint violations (sorted by count, descending)
	 */
	violationStats: ViolationStats[];

	/**
	 * Full violation tracker for detailed analysis
	 */
	violationTracker: ViolationTracker;

	/**
	 * Summary statistics
	 */
	summary: {
		/**
		 * Total number of assignments created
		 */
		totalAssignments: number;

		/**
		 * Total number of constraint violations encountered
		 */
		totalViolations: number;

		/**
		 * Top 3 most frequently violated constraints
		 */
		mostBlockingConstraints: string[];
	};
}
