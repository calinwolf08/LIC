import type { Selectable } from 'kysely';
import type {
	Students,
	Preceptors,
	Clerkships,
	PreceptorAvailability,
	HealthSystems,
	Teams,
	Sites,
	SiteAvailability,
	SiteCapacityRules
} from '$lib/db/types';
import type { SchedulingContext } from '../types';
import { initializeStudentRequirements } from './requirement-tracker';

/**
 * Optional data for building enhanced scheduling context
 */
export interface OptionalContextData {
	healthSystems?: Selectable<HealthSystems>[];
	teams?: Selectable<Teams>[];
	sites?: Selectable<Sites>[];
	studentOnboarding?: Array<{
		student_id: string;
		health_system_id: string;
		is_completed: number;
	}>;
	preceptorClerkships?: Array<{
		preceptor_id: string;
		site_id: string;
		clerkship_id: string;
	}>;
	preceptorElectives?: Array<{
		preceptor_id: string;
		elective_requirement_id: string;
	}>;
	clerkshipSites?: Array<{
		clerkship_id: string;
		site_id: string;
	}>;
	siteElectives?: Array<{
		site_id: string;
		elective_requirement_id: string;
	}>;
	siteAvailability?: Selectable<SiteAvailability>[];
	siteCapacityRules?: Selectable<SiteCapacityRules>[];
	preceptorTeamMembers?: Array<{
		preceptor_id: string;
		team_id: string;
	}>;
}

/**
 * Build the scheduling context from database data
 *
 * Initializes all maps and lookups needed for efficient scheduling.
 *
 * @param students - All students to schedule
 * @param preceptors - All available preceptors
 * @param clerkships - All clerkship types with requirements
 * @param blackoutDates - Array of blackout date strings
 * @param preceptorAvailabilityRecords - Availability records from database
 * @param startDate - Academic year start
 * @param endDate - Academic year end
 * @param optionalData - Optional data for enhanced constraints (health systems, teams, onboarding, associations)
 * @returns Fully initialized scheduling context
 */
export function buildSchedulingContext(
	students: Selectable<Students>[],
	preceptors: Selectable<Preceptors>[],
	clerkships: Selectable<Clerkships>[],
	blackoutDates: string[],
	preceptorAvailabilityRecords: Selectable<PreceptorAvailability>[],
	startDate: string,
	endDate: string,
	optionalData?: OptionalContextData
): SchedulingContext {
	// Convert blackout dates array to Set for O(1) lookup
	const blackoutDatesSet = new Set(blackoutDates);

	// Build preceptor availability map
	const preceptorAvailability = new Map<string, Set<string>>();
	for (const preceptor of preceptors) {
		preceptorAvailability.set(preceptor.id!, new Set());
	}

	for (const record of preceptorAvailabilityRecords) {
		if (record.is_available) {
			const dates = preceptorAvailability.get(record.preceptor_id);
			if (dates) {
				dates.add(record.date);
			}
		}
	}

	// Initialize student requirements
	const studentRequirements = initializeStudentRequirements(students, clerkships);

	// Initialize empty assignment tracking structures
	const assignmentsByDate = new Map<string, any[]>();
	const assignmentsByStudent = new Map<string, any[]>();
	const assignmentsByPreceptor = new Map<string, any[]>();

	// Build context with base data
	const context: SchedulingContext = {
		students,
		preceptors,
		clerkships,
		blackoutDates: blackoutDatesSet,
		startDate,
		endDate,
		assignments: [],
		preceptorAvailability,
		studentRequirements,
		assignmentsByDate,
		assignmentsByStudent,
		assignmentsByPreceptor
	};

	// Add optional data if provided
	if (optionalData) {
		// Add health systems
		if (optionalData.healthSystems) {
			context.healthSystems = optionalData.healthSystems;
		}

		// Add teams
		if (optionalData.teams) {
			context.teams = optionalData.teams;
		}

		// Add sites
		if (optionalData.sites) {
			context.sites = optionalData.sites;
		}

		// Build student onboarding map
		if (optionalData.studentOnboarding) {
			const studentOnboarding = new Map<string, Set<string>>();
			for (const record of optionalData.studentOnboarding) {
				if (record.is_completed === 1) {
					if (!studentOnboarding.has(record.student_id)) {
						studentOnboarding.set(record.student_id, new Set());
					}
					studentOnboarding.get(record.student_id)!.add(record.health_system_id);
				}
			}
			context.studentOnboarding = studentOnboarding;
		}

		// Build preceptor-clerkship associations map (three-way: preceptor -> site -> clerkships)
		if (optionalData.preceptorClerkships) {
			const preceptorClerkshipAssociations = new Map<string, Map<string, Set<string>>>();
			for (const record of optionalData.preceptorClerkships) {
				if (!preceptorClerkshipAssociations.has(record.preceptor_id)) {
					preceptorClerkshipAssociations.set(record.preceptor_id, new Map());
				}
				const preceptorMap = preceptorClerkshipAssociations.get(record.preceptor_id)!;
				if (!preceptorMap.has(record.site_id)) {
					preceptorMap.set(record.site_id, new Set());
				}
				preceptorMap.get(record.site_id)!.add(record.clerkship_id);
			}
			context.preceptorClerkshipAssociations = preceptorClerkshipAssociations;
		}

		// Build preceptor-elective associations map (DEPRECATED - kept for backward compatibility)
		if (optionalData.preceptorElectives) {
			const preceptorElectiveAssociations = new Map<string, Set<string>>();
			for (const record of optionalData.preceptorElectives) {
				if (!preceptorElectiveAssociations.has(record.preceptor_id)) {
					preceptorElectiveAssociations.set(record.preceptor_id, new Set());
				}
				preceptorElectiveAssociations
					.get(record.preceptor_id)!
					.add(record.elective_requirement_id);
			}
			context.preceptorElectiveAssociations = preceptorElectiveAssociations;
		}

		// Build clerkship-site associations map
		if (optionalData.clerkshipSites) {
			const clerkshipSites = new Map<string, Set<string>>();
			for (const record of optionalData.clerkshipSites) {
				if (!clerkshipSites.has(record.clerkship_id)) {
					clerkshipSites.set(record.clerkship_id, new Set());
				}
				clerkshipSites.get(record.clerkship_id)!.add(record.site_id);
			}
			context.clerkshipSites = clerkshipSites;
		}

		// Build site-elective associations map
		if (optionalData.siteElectives) {
			const siteElectiveAssociations = new Map<string, Set<string>>();
			for (const record of optionalData.siteElectives) {
				if (!siteElectiveAssociations.has(record.site_id)) {
					siteElectiveAssociations.set(record.site_id, new Set());
				}
				siteElectiveAssociations.get(record.site_id)!.add(record.elective_requirement_id);
			}
			context.siteElectiveAssociations = siteElectiveAssociations;
		}

		// Build site availability map
		if (optionalData.siteAvailability) {
			const siteAvailability = new Map<string, Map<string, boolean>>();
			for (const site of optionalData.sites || []) {
				siteAvailability.set(site.id!, new Map());
			}

			for (const record of optionalData.siteAvailability) {
				const siteMap = siteAvailability.get(record.site_id);
				if (siteMap) {
					siteMap.set(record.date, record.is_available === 1);
				}
			}
			context.siteAvailability = siteAvailability;
		}

		// Build site capacity rules map
		if (optionalData.siteCapacityRules) {
			const siteCapacityRules = new Map<string, Selectable<SiteCapacityRules>[]>();
			for (const rule of optionalData.siteCapacityRules) {
				if (!siteCapacityRules.has(rule.site_id)) {
					siteCapacityRules.set(rule.site_id, []);
				}
				siteCapacityRules.get(rule.site_id)!.push(rule);
			}
			context.siteCapacityRules = siteCapacityRules;
		}

		// Build preceptor-team membership map
		if (optionalData.preceptorTeamMembers) {
			const preceptorTeams = new Map<string, Set<string>>();
			for (const record of optionalData.preceptorTeamMembers) {
				if (!preceptorTeams.has(record.preceptor_id)) {
					preceptorTeams.set(record.preceptor_id, new Set());
				}
				preceptorTeams.get(record.preceptor_id)!.add(record.team_id);
			}
			context.preceptorTeams = preceptorTeams;
		}
	}

	return context;
}
