import type {
	Students,
	Preceptors,
	Clerkships,
	PreceptorAvailabilityTable,
} from '$lib/db/types';
import type { SchedulingContext } from '../types';
import { initializeStudentRequirements } from './requirement-tracker';

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
 * @returns Fully initialized scheduling context
 */
export function buildSchedulingContext(
	students: Students[],
	preceptors: Preceptors[],
	clerkships: Clerkships[],
	blackoutDates: string[],
	preceptorAvailabilityRecords: PreceptorAvailabilityTable[],
	startDate: string,
	endDate: string
): SchedulingContext {
	// Convert blackout dates array to Set for O(1) lookup
	const blackoutDatesSet = new Set(blackoutDates);

	// Build preceptor availability map
	const preceptorAvailability = new Map<string, Set<string>>();
	for (const preceptor of preceptors) {
		preceptorAvailability.set(preceptor.id, new Set());
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

	return {
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
		assignmentsByPreceptor,
	};
}
