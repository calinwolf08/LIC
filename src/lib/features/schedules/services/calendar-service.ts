/**
 * Calendar Service Layer
 *
 * Functions for aggregating and formatting schedule data for calendar display
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type {
	EnrichedAssignment,
	CalendarEvent,
	DailyAssignments,
	CalendarFilters,
	ScheduleSummary
} from '../types';

/**
 * Get assignments with all related entity data via JOINs
 */
export async function getEnrichedAssignments(
	db: Kysely<DB>,
	filters: CalendarFilters
): Promise<EnrichedAssignment[]> {
	let query = db
		.selectFrom('schedule_assignments as sa')
		.innerJoin('students as s', 's.id', 'sa.student_id')
		.innerJoin('preceptors as p', 'p.id', 'sa.preceptor_id')
		.innerJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.select([
			'sa.id',
			'sa.student_id',
			'sa.preceptor_id',
			'sa.clerkship_id',
			'sa.date',
			'sa.status',
			'sa.created_at',
			'sa.updated_at',
			's.name as student_name',
			's.email as student_email',
			'p.name as preceptor_name',
			'p.email as preceptor_email',
			'c.name as clerkship_name',
			'c.specialty as clerkship_specialty',
			'c.required_days as clerkship_required_days'
		]);

	// Apply date range filters (required)
	query = query.where('sa.date', '>=', filters.start_date).where('sa.date', '<=', filters.end_date);

	// Apply optional filters
	if (filters.student_id) {
		query = query.where('sa.student_id', '=', filters.student_id);
	}

	if (filters.preceptor_id) {
		query = query.where('sa.preceptor_id', '=', filters.preceptor_id);
	}

	if (filters.clerkship_id) {
		query = query.where('sa.clerkship_id', '=', filters.clerkship_id);
	}

	const results = await query.orderBy('sa.date', 'asc').execute();

	return results as EnrichedAssignment[];
}

/**
 * Convert assignments to calendar event format
 */
export async function getCalendarEvents(
	db: Kysely<DB>,
	filters: CalendarFilters
): Promise<CalendarEvent[]> {
	const assignments = await getEnrichedAssignments(db, filters);

	return assignments.map((assignment) => ({
		id: assignment.id,
		title: `${assignment.student_name} - ${assignment.clerkship_name}`,
		date: assignment.date,
		description: `with ${assignment.preceptor_name}`,
		color: getClerkshipColor(assignment.clerkship_specialty),
		assignment
	}));
}

/**
 * Group assignments by date
 */
export async function getDailyAssignments(
	db: Kysely<DB>,
	filters: CalendarFilters
): Promise<DailyAssignments[]> {
	const assignments = await getEnrichedAssignments(db, filters);

	// Group by date
	const groupedMap = new Map<string, EnrichedAssignment[]>();

	for (const assignment of assignments) {
		const date = assignment.date;
		if (!groupedMap.has(date)) {
			groupedMap.set(date, []);
		}
		groupedMap.get(date)!.push(assignment);
	}

	// Convert to array and sort by date
	const dailyAssignments: DailyAssignments[] = Array.from(groupedMap.entries())
		.map(([date, assignments]) => ({
			date,
			assignments,
			count: assignments.length
		}))
		.sort((a, b) => a.date.localeCompare(b.date));

	return dailyAssignments;
}

/**
 * Get all assignments for a specific student
 */
export async function getAssignmentsByStudent(
	db: Kysely<DB>,
	studentId: string,
	startDate?: string,
	endDate?: string
): Promise<EnrichedAssignment[]> {
	const filters: CalendarFilters = {
		student_id: studentId,
		start_date: startDate || '1900-01-01',
		end_date: endDate || '2100-12-31'
	};

	return await getEnrichedAssignments(db, filters);
}

/**
 * Get all assignments for a specific preceptor
 */
export async function getAssignmentsByPreceptor(
	db: Kysely<DB>,
	preceptorId: string,
	startDate?: string,
	endDate?: string
): Promise<EnrichedAssignment[]> {
	const filters: CalendarFilters = {
		preceptor_id: preceptorId,
		start_date: startDate || '1900-01-01',
		end_date: endDate || '2100-12-31'
	};

	return await getEnrichedAssignments(db, filters);
}

/**
 * Get schedule summary statistics for a date range
 */
export async function getScheduleSummary(
	db: Kysely<DB>,
	startDate: string,
	endDate: string
): Promise<ScheduleSummary> {
	const filters: CalendarFilters = {
		start_date: startDate,
		end_date: endDate
	};

	const assignments = await getEnrichedAssignments(db, filters);

	// Calculate statistics
	const uniqueStudents = new Set(assignments.map((a) => a.student_id));
	const uniquePreceptors = new Set(assignments.map((a) => a.preceptor_id));

	// Group by clerkship
	const clerkshipCounts = new Map<string, { name: string; count: number }>();
	for (const assignment of assignments) {
		const key = assignment.clerkship_id;
		if (!clerkshipCounts.has(key)) {
			clerkshipCounts.set(key, {
				name: assignment.clerkship_name,
				count: 0
			});
		}
		clerkshipCounts.get(key)!.count++;
	}

	const assignmentsByClerkship = Array.from(clerkshipCounts.values())
		.map(({ name, count }) => ({
			clerkship_name: name,
			count
		}))
		.sort((a, b) => b.count - a.count);

	return {
		total_assignments: assignments.length,
		active_students: uniqueStudents.size,
		active_preceptors: uniquePreceptors.size,
		assignments_by_clerkship: assignmentsByClerkship
	};
}

/**
 * Get color for clerkship specialty (simple color mapping)
 */
function getClerkshipColor(specialty: string | null | undefined): string {
	// Simple hash-based color assignment
	const colors = [
		'#3b82f6', // blue
		'#10b981', // green
		'#f59e0b', // amber
		'#ef4444', // red
		'#8b5cf6', // purple
		'#ec4899', // pink
		'#06b6d4', // cyan
		'#84cc16' // lime
	];

	// Handle null/undefined specialty - use default color
	const value = specialty ?? 'default';

	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = value.charCodeAt(i) + ((hash << 5) - hash);
	}

	return colors[Math.abs(hash) % colors.length];
}
