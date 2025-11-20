import type { Selectable } from 'kysely';
import type {
	Students,
	Preceptors,
	Clerkships,
	PreceptorAvailability,
	HealthSystems,
	Teams
} from '$lib/db/types';
import type { SchedulingContext } from '../types';
import { initializeStudentRequirements } from './requirement-tracker';

/**
 * Optional data for building enhanced scheduling context
 */
export interface OptionalContextData {
	healthSystems?: Selectable<HealthSystems>[];
	teams?: Selectable<Teams>[];
	studentOnboarding?: Array<{
		student_id: string;
		health_system_id: string;
		is_completed: number;
	}>;
	preceptorClerkships?: Array<{
		preceptor_id: string;
		clerkship_id: string;
	}>;
	preceptorElectives?: Array<{
		preceptor_id: string;
		elective_requirement_id: string;
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

		// Build preceptor-clerkship associations map
		if (optionalData.preceptorClerkships) {
			const preceptorClerkshipAssociations = new Map<string, Set<string>>();
			for (const record of optionalData.preceptorClerkships) {
				if (!preceptorClerkshipAssociations.has(record.preceptor_id)) {
					preceptorClerkshipAssociations.set(record.preceptor_id, new Set());
				}
				preceptorClerkshipAssociations.get(record.preceptor_id)!.add(record.clerkship_id);
			}
			context.preceptorClerkshipAssociations = preceptorClerkshipAssociations;
		}

		// Build preceptor-elective associations map
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
	}

	return context;
}
