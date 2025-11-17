/**
 * Schedule and Calendar Type Definitions
 */

import type { ScheduleAssignmentsTable } from '$lib/db/types';

/**
 * Enriched assignment with entity names (from JOIN queries)
 */
export interface EnrichedAssignment extends ScheduleAssignmentsTable {
	student_name: string;
	student_email: string;
	preceptor_name: string;
	preceptor_email: string;
	preceptor_specialty: string;
	clerkship_name: string;
	clerkship_specialty: string;
	clerkship_required_days: number;
}

/**
 * Calendar event format for calendar components
 */
export interface CalendarEvent {
	id: string;
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
