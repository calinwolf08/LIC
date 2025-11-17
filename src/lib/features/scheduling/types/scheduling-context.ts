import type {
	Students,
	Preceptors,
	Clerkships,
} from '$lib/db/types';
import type { Assignment } from './assignment';

/**
 * Complete context for the scheduling algorithm
 * Contains all master data and current state during scheduling
 */
export interface SchedulingContext {
	// ===== Master Data =====

	/**
	 * All students to be scheduled
	 */
	students: Students[];

	/**
	 * All available preceptors
	 */
	preceptors: Preceptors[];

	/**
	 * All clerkship types with requirements
	 */
	clerkships: Clerkships[];

	/**
	 * System-wide blackout dates (no scheduling allowed)
	 * Set of ISO date strings (YYYY-MM-DD)
	 */
	blackoutDates: Set<string>;

	// ===== Date Range =====

	/**
	 * Academic year start date (ISO format YYYY-MM-DD)
	 */
	startDate: string;

	/**
	 * Academic year end date (ISO format YYYY-MM-DD)
	 */
	endDate: string;

	// ===== Current Scheduling State =====

	/**
	 * All assignments created so far
	 */
	assignments: Assignment[];

	// ===== Precomputed Lookups (for performance) =====

	/**
	 * Preceptor availability lookup
	 * Map: preceptorId -> Set of available dates (ISO strings)
	 */
	preceptorAvailability: Map<string, Set<string>>;

	/**
	 * Student requirements remaining
	 * Map: studentId -> Map(clerkshipId -> days still needed)
	 */
	studentRequirements: Map<string, Map<string, number>>;

	// ===== Tracking Current State (updated during scheduling) =====

	/**
	 * Assignments grouped by date for quick lookup
	 * Map: date -> assignments on that date
	 */
	assignmentsByDate: Map<string, Assignment[]>;

	/**
	 * Assignments grouped by student for quick lookup
	 * Map: studentId -> all assignments for that student
	 */
	assignmentsByStudent: Map<string, Assignment[]>;

	/**
	 * Assignments grouped by preceptor for quick lookup
	 * Map: preceptorId -> all assignments for that preceptor
	 */
	assignmentsByPreceptor: Map<string, Assignment[]>;
}
