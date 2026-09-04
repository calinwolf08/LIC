/**
 * Schedule and Calendar Type Definitions
 */

import type { Selectable } from 'kysely';
import type { ScheduleAssignments } from '$lib/db/types';

/**
 * Enriched assignment with entity names (from JOIN queries)
 */
export interface EnrichedAssignment extends Selectable<ScheduleAssignments> {
	student_name: string;
	student_email: string;
	preceptor_name: string;
	preceptor_email: string;
	clerkship_name: string;
	clerkship_specialty: string;
	clerkship_required_days: number;
	/** Name of the elective this day satisfies, when `elective_id` is set (P-01/P-07). */
	elective_name: string | null;
}

/**
 * Calendar event format for calendar components
 */
export interface CalendarEvent {
	id: string | null;
	title: string;
	date: string; // YYYY-MM-DD
	description: string;
	color: string;
	assignment: EnrichedAssignment;
}

/**
 * Grouped assignments by date
 */
export interface DailyAssignments {
	date: string; // YYYY-MM-DD
	assignments: EnrichedAssignment[];
	count: number;
}

/**
 * Calendar filters
 */
export interface CalendarFilters {
	/**
	 * Active schedule id. Required — assignments are scoped to a schedule through
	 * `schedule_students`, so every calendar read must be constrained to one
	 * tenant's schedule or it leaks other users' assignments.
	 */
	scheduleId: string;
	student_id?: string;
	preceptor_id?: string;
	clerkship_id?: string;
	start_date: string;
	end_date: string;
}

/**
 * Schedule summary statistics
 */
export interface ScheduleSummary {
	total_assignments: number;
	active_students: number;
	active_preceptors: number;
	assignments_by_clerkship: {
		clerkship_name: string;
		count: number;
	}[];
}
