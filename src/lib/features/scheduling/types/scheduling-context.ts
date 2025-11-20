import type { Selectable } from 'kysely';
import type {
	Students,
	Preceptors,
	Clerkships,
	HealthSystems,
	Teams
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
	students: Selectable<Students>[];

	/**
	 * All available preceptors
	 */
	preceptors: Selectable<Preceptors>[];

	/**
	 * All clerkship types with requirements
	 */
	clerkships: Selectable<Clerkships>[];

	/**
	 * All health systems (optional, for health system continuity constraints)
	 */
	healthSystems?: Selectable<HealthSystems>[];

	/**
	 * All teams (optional, for team assignment constraints)
	 */
	teams?: Selectable<Teams>[];

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

	/**
	 * Student health system onboarding completion (optional)
	 * Map: studentId -> Set of health system IDs where onboarding is complete
	 * Used by StudentOnboardingConstraint to enforce onboarding requirements
	 */
	studentOnboarding?: Map<string, Set<string>>;

	/**
	 * Preceptor-clerkship associations (optional)
	 * Map: preceptorId -> Set of clerkship IDs they can teach
	 * Used by PreceptorClerkshipAssociationConstraint
	 */
	preceptorClerkshipAssociations?: Map<string, Set<string>>;

	/**
	 * Preceptor-elective associations (optional)
	 * Map: preceptorId -> Set of elective requirement IDs they can teach
	 * Used by PreceptorClerkshipAssociationConstraint for electives
	 */
	preceptorElectiveAssociations?: Map<string, Set<string>>;

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
