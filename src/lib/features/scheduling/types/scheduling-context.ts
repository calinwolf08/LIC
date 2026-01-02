import type { Selectable } from 'kysely';
import type {
	Students,
	Preceptors,
	Clerkships,
	HealthSystems,
	Teams,
	Sites,
	SiteCapacityRules
} from '$lib/db/types';
import type { Assignment } from './assignment';

/**
 * Elective information for scheduling
 */
export interface ElectiveInfo {
	id: string;
	name: string;
	minimumDays: number;
	isRequired: boolean;
	requirementId: string;
	clerkshipId: string;
}

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
	 * All sites (optional, for site-based constraints)
	 */
	sites?: Selectable<Sites>[];

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
	 * Preceptor site-based availability lookup
	 * Map: preceptorId -> Map(date -> siteId)
	 * A preceptor is available at exactly one site per day
	 */
	preceptorAvailability: Map<string, Map<string, string>>;

	/**
	 * Site availability lookup (optional)
	 * Map: siteId -> Map(date -> isAvailable)
	 * Used by SiteAvailabilityConstraint
	 */
	siteAvailability?: Map<string, Map<string, boolean>>;

	/**
	 * Site capacity rules lookup (optional)
	 * Map: siteId -> array of capacity rules
	 * Used by SiteCapacityConstraint
	 */
	siteCapacityRules?: Map<string, Selectable<SiteCapacityRules>[]>;

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
	 * Preceptor-clerkship associations (optional, three-way)
	 * Map: preceptorId -> Map(siteId -> Set of clerkship IDs they can teach at that site)
	 * Used by ValidSiteForClerkshipConstraint and PreceptorClerkshipAssociationConstraint
	 */
	preceptorClerkshipAssociations?: Map<string, Map<string, Set<string>>>;

	/**
	 * Preceptor-elective associations (optional, DEPRECATED)
	 * Map: preceptorId -> Set of elective requirement IDs they can teach
	 * Used by PreceptorClerkshipAssociationConstraint for electives (backward compatibility)
	 */
	preceptorElectiveAssociations?: Map<string, Set<string>>;

	/**
	 * Clerkship-site associations (optional)
	 * Map: clerkshipId -> Set of site IDs where clerkship is offered
	 * Used by ValidSiteForClerkshipConstraint
	 */
	clerkshipSites?: Map<string, Set<string>>;

	/**
	 * Preceptor-team membership (optional)
	 * Map: preceptorId -> Set of team IDs the preceptor belongs to
	 * Used by SamePreceptorTeamConstraint
	 */
	preceptorTeams?: Map<string, Set<string>>;

	// ===== Elective Data (for elective scheduling) =====

	/**
	 * All electives indexed by clerkship
	 * Map: clerkshipId -> array of electives for that clerkship
	 */
	electivesByClerkship?: Map<string, ElectiveInfo[]>;

	/**
	 * Preceptors associated with each elective
	 * Map: electiveId -> Set of preceptor IDs
	 */
	electivePreceptors?: Map<string, Set<string>>;

	/**
	 * Sites associated with each elective
	 * Map: electiveId -> Set of site IDs
	 */
	electiveSites?: Map<string, Set<string>>;

	/**
	 * Student elective requirements remaining
	 * Map: studentId -> Map(electiveId -> days still needed)
	 * Tracks required elective progress separately from regular clerkship days
	 */
	studentElectiveRequirements?: Map<string, Map<string, number>>;

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
