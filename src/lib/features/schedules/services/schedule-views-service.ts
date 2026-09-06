/**
 * Schedule Views Service
 *
 * Business logic for computing student schedules, preceptor schedules,
 * and schedule summaries with progress tracking.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import type {
	StudentSchedule,
	PreceptorSchedule,
	ScheduleResultsSummary,
	ClerkshipProgress,
	CalendarMonth,
	CalendarWeek,
	CalendarDay,
	StudentAssignment,
	PreceptorAssignment,
	PreceptorCapacitySummary,
	StudentWithUnmetRequirements
} from '../types/schedule-views';
import {
	parseUTCDate,
	formatUTCDate,
	getMonthsBetween,
	getTodayUTC,
	getDaysBetween
} from '$lib/features/scheduling/utils/date-utils';
import { parseCodes } from './assignment-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:schedules:views');

// ============================================================================
// Student Schedule
// ============================================================================

/**
 * Get complete student schedule with progress breakdown
 */
export async function getStudentScheduleData(
	db: Kysely<DB>,
	studentId: string,
	scheduleId: string | null
): Promise<StudentSchedule | null> {
	log.debug('Fetching student schedule data', { studentId, scheduleId });

	// No active schedule → nothing to show. Never fall through to an unscoped
	// student lookup, which would disclose another tenant's name/email.
	if (!scheduleId) {
		log.debug('No active schedule', { studentId });
		return null;
	}

	// The student must belong to this schedule. Scoping the lookup here (not just
	// in the caller) makes the service safe regardless of who calls it — a
	// caller-only guard has been missed before.
	const student = await db
		.selectFrom('students')
		.innerJoin('schedule_students as ss', (join) =>
			join.onRef('ss.student_id', '=', 'students.id').on('ss.schedule_id', '=', scheduleId)
		)
		.select(['students.id', 'students.name', 'students.email'])
		.where('students.id', '=', studentId)
		.executeTakeFirst();

	if (!student) {
		log.debug('Student not found in schedule', { studentId, scheduleId });
		return null;
	}

	// Resolve the range from the caller's active schedule — never the global
	// is_active flag, and never a fabricated calendar-year fallback. When there
	// is no active schedule, return an empty (but valid) payload the UI renders
	// as its "no active schedule" state.
	const period = await resolvePeriod(db, scheduleId);
	if (!period) {
		return emptyStudentSchedule(student);
	}
	const startDate = period.start_date;
	const endDate = period.end_date;

	// Clerkship requirements for THIS schedule only — a global list would count
	// (and disclose) other tenants' clerkships in the progress breakdown.
	const clerkships = await db
		.selectFrom('clerkships')
		.innerJoin('schedule_clerkships as sc', 'sc.clerkship_id', 'clerkships.id')
		.where('sc.schedule_id', '=', scheduleId)
		.select([
			'clerkships.id as id',
			'clerkships.name as name',
			'clerkships.specialty as specialty',
			'clerkships.required_days as required_days'
		])
		.execute();

	// Get all assignments for this student in the period
	// Note: We don't join preceptor_sites here to avoid row multiplication
	// when a preceptor works at multiple sites
	const assignments = await db
		.selectFrom('schedule_assignments as sa')
		.innerJoin('preceptors as p', 'p.id', 'sa.preceptor_id')
		.innerJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.leftJoin('clerkship_electives as e', 'e.id', 'sa.elective_id')
		.select([
			'sa.id',
			'sa.date',
			'sa.status',
			'sa.clerkship_id',
			'c.name as clerkship_name',
			'c.specialty as clerkship_specialty',
			'sa.preceptor_id',
			'p.name as preceptor_name',
			'p.health_system_id as health_system_id',
			// Provenance / edit-safety (Phase 1b.4 / P-07)
			'sa.source',
			'sa.locked',
			'sa.elective_id',
			'sa.override_codes',
			'e.name as elective_name'
		])
		.where('sa.student_id', '=', studentId)
		.where('sa.date', '>=', startDate)
		.where('sa.date', '<=', endDate)
		.orderBy('sa.date', 'asc')
		.execute();

	// Get unique preceptor IDs to fetch their sites separately
	const preceptorIds = [...new Set(assignments.map((a) => a.preceptor_id))];

	// Health system names, so the page can name an onboarding gap without a
	// second round trip.
	const healthSystemIds = [
		...new Set(assignments.map((a) => a.health_system_id).filter((id): id is string => !!id))
	];
	const healthSystemRows =
		healthSystemIds.length > 0
			? await db
					.selectFrom('health_systems')
					.select(['id', 'name'])
					.where('id', 'in', healthSystemIds)
					.execute()
			: [];
	const healthSystemNames = new Map(healthSystemRows.map((h) => [h.id as string, h.name]));

	// Fetch preceptor sites separately (one query, no multiplication)
	const preceptorSitesData = preceptorIds.length > 0
		? await db
				.selectFrom('preceptor_sites as ps')
				.innerJoin('sites as s', 's.id', 'ps.site_id')
				.select(['ps.preceptor_id', 's.id as site_id', 's.name as site_name'])
				.where('ps.preceptor_id', 'in', preceptorIds)
				.execute()
		: [];

	// Build a map of preceptor_id -> first site (for display purposes)
	const preceptorSiteMap = new Map<string, { site_id: string; site_name: string }>();
	for (const ps of preceptorSitesData) {
		if (!preceptorSiteMap.has(ps.preceptor_id) && ps.site_id && ps.site_name) {
			preceptorSiteMap.set(ps.preceptor_id, { site_id: ps.site_id, site_name: ps.site_name });
		}
	}

	// Enrich assignments with site info
	const enrichedAssignments = assignments.map((a) => {
		const site = preceptorSiteMap.get(a.preceptor_id);
		return {
			...a,
			site_id: site?.site_id ?? null,
			site_name: site?.site_name ?? null
		};
	});

	// Calculate progress per clerkship
	const clerkshipProgress: ClerkshipProgress[] = [];

	for (const clerkship of clerkships) {
		const clerkshipAssignments = enrichedAssignments.filter((a) => a.clerkship_id === clerkship.id);
		const assignedDays = clerkshipAssignments.length;
		const requiredDays = clerkship.required_days;
		const remainingDays = Math.max(0, requiredDays - assignedDays);
		const percentComplete = requiredDays > 0 ? Math.min(100, (assignedDays / requiredDays) * 100) : 100;

		// Group by preceptor
		const preceptorMap = new Map<string, { id: string; name: string; daysAssigned: number }>();
		const siteMap = new Map<string, { id: string; name: string }>();

		for (const a of clerkshipAssignments) {
			if (!preceptorMap.has(a.preceptor_id)) {
				preceptorMap.set(a.preceptor_id, {
					id: a.preceptor_id,
					name: a.preceptor_name,
					daysAssigned: 0
				});
			}
			preceptorMap.get(a.preceptor_id)!.daysAssigned++;

			if (a.site_id && a.site_name && !siteMap.has(a.site_id)) {
				siteMap.set(a.site_id, { id: a.site_id, name: a.site_name });
			}
		}

		clerkshipProgress.push({
			clerkshipId: clerkship.id as string,
			clerkshipName: clerkship.name,
			specialty: clerkship.specialty ?? 'General',
			requiredDays,
			assignedDays,
			remainingDays,
			percentComplete: Math.round(percentComplete),
			isComplete: assignedDays >= requiredDays,
			preceptors: Array.from(preceptorMap.values()),
			sites: Array.from(siteMap.values())
		});
	}

	// Calculate summary
	const totalRequiredDays = clerkshipProgress.reduce((sum, c) => sum + c.requiredDays, 0);
	const totalAssignedDays = clerkshipProgress.reduce((sum, c) => sum + c.assignedDays, 0);
	const clerkshipsComplete = clerkshipProgress.filter((c) => c.isComplete).length;
	const clerkshipsWithNoAssignments = clerkshipProgress.filter((c) => c.assignedDays === 0).length;

	// Build calendar
	const calendar = buildCalendarMonths(startDate, endDate, enrichedAssignments.map((a) => ({
		date: a.date,
		assignment: {
			id: a.id as string,
			clerkshipId: a.clerkship_id,
			clerkshipName: a.clerkship_name,
			preceptorId: a.preceptor_id,
			preceptorName: a.preceptor_name,
			studentId: student.id as string,
			studentName: student.name,
			color: getClerkshipColor(a.clerkship_specialty ?? 'General'),
			source: a.source,
			locked: Boolean(a.locked),
			electiveName: a.elective_name ?? undefined
		}
	})));

	// Format assignments list
	const formattedAssignments: StudentAssignment[] = enrichedAssignments.map((a) => ({
		id: a.id as string,
		date: a.date,
		clerkshipId: a.clerkship_id,
		clerkshipName: a.clerkship_name,
		clerkshipColor: getClerkshipColor(a.clerkship_specialty ?? 'General'),
		preceptorId: a.preceptor_id,
		preceptorName: a.preceptor_name,
		siteId: a.site_id ?? undefined,
		siteName: a.site_name || undefined,
		healthSystemId: a.health_system_id ?? undefined,
		healthSystemName: a.health_system_id
			? (healthSystemNames.get(a.health_system_id) ?? undefined)
			: undefined,
		status: a.status,
		source: a.source,
		locked: Boolean(a.locked),
		electiveId: a.elective_id ?? undefined,
		electiveName: a.elective_name ?? undefined,
		overrideCodes: parseCodes(a.override_codes)
	}));

	log.info('Student schedule data fetched', {
		studentId,
		studentName: student.name,
		totalAssignedDays,
		totalRequiredDays,
		clerkshipsComplete,
		clerkshipsTotal: clerkships.length,
		overallPercentComplete: totalRequiredDays > 0 ? Math.round((totalAssignedDays / totalRequiredDays) * 100) : 100
	});

	return {
		student: {
			id: student.id as string,
			name: student.name,
			email: student.email
		},
		period: period ? {
			id: period.id as string,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		} : null,
		clerkshipProgress,
		summary: {
			totalAssignedDays,
			totalRequiredDays,
			overallPercentComplete: totalRequiredDays > 0 ? Math.round((totalAssignedDays / totalRequiredDays) * 100) : 100,
			clerkshipsComplete,
			clerkshipsTotal: clerkships.length,
			clerkshipsWithNoAssignments
		},
		calendar,
		assignments: formattedAssignments
	};
}

// ============================================================================
// Preceptor Schedule
// ============================================================================

/**
 * Get complete preceptor schedule with capacity breakdown
 */
export async function getPreceptorScheduleData(
	db: Kysely<DB>,
	preceptorId: string,
	scheduleId: string | null
): Promise<PreceptorSchedule | null> {
	log.debug('Fetching preceptor schedule data', { preceptorId, scheduleId });

	// Get preceptor info
	const preceptor = await db
		.selectFrom('preceptors as p')
		.leftJoin('health_systems as hs', 'hs.id', 'p.health_system_id')
		.select(['p.id', 'p.name', 'p.email', 'hs.name as health_system_name'])
		.where('p.id', '=', preceptorId)
		.executeTakeFirst();

	if (!preceptor) {
		log.debug('Preceptor not found', { preceptorId });
		return null;
	}

	// Resolve the range from the caller's active schedule (see student note above).
	const period = await resolvePeriod(db, scheduleId);
	if (!period) {
		return emptyPreceptorSchedule(preceptor);
	}
	const startDate = period.start_date;
	const endDate = period.end_date;

	// Get preceptor availability
	const availability = await db
		.selectFrom('preceptor_availability')
		.select(['date', 'is_available'])
		.where('preceptor_id', '=', preceptorId)
		.where('date', '>=', startDate)
		.where('date', '<=', endDate)
		.execute();

	const availabilityMap = new Map<string, boolean>();
	for (const a of availability) {
		availabilityMap.set(a.date, a.is_available === 1);
	}

	// Get all assignments for this preceptor
	const assignments = await db
		.selectFrom('schedule_assignments as sa')
		.innerJoin('students as s', 's.id', 'sa.student_id')
		.innerJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.leftJoin('clerkship_electives as e', 'e.id', 'sa.elective_id')
		.select([
			'sa.id',
			'sa.date',
			'sa.status',
			'sa.student_id',
			's.name as student_name',
			'sa.clerkship_id',
			'c.name as clerkship_name',
			'c.specialty as clerkship_specialty',
			// Provenance / edit-safety (Phase 1b.4 / P-07)
			'sa.source',
			'sa.locked',
			'sa.elective_id',
			'sa.override_codes',
			'e.name as elective_name'
		])
		.where('sa.preceptor_id', '=', preceptorId)
		.where('sa.date', '>=', startDate)
		.where('sa.date', '<=', endDate)
		.orderBy('sa.date', 'asc')
		.execute();

	// Create assignment lookup by date
	const assignmentByDate = new Map<string, typeof assignments[0]>();
	for (const a of assignments) {
		assignmentByDate.set(a.date, a);
	}

	// Calculate monthly capacity
	const monthlyCapacity: PreceptorCapacitySummary[] = [];
	const months = getMonthsBetween(startDate, endDate);

	let totalAvailable = 0;
	let totalAssigned = 0;

	for (const { year, month, name } of months) {
		const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
		const lastDay = new Date(year, month, 0).getDate();
		const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

		let available = 0;
		let assigned = 0;

		// Count days - use UTC to avoid timezone shifts
		const current = parseUTCDate(monthStart);
		const end = parseUTCDate(monthEnd);

		while (current <= end) {
			const dateStr = formatUTCDate(current);

			// Only count if within period bounds
			if (dateStr >= startDate && dateStr <= endDate) {
				const isAvailable = availabilityMap.get(dateStr);
				if (isAvailable === true) {
					available++;
				}
				if (assignmentByDate.has(dateStr)) {
					assigned++;
				}
			}

			current.setUTCDate(current.getUTCDate() + 1);
		}

		totalAvailable += available;
		totalAssigned += assigned;

		monthlyCapacity.push({
			periodName: name,
			startDate: monthStart > startDate ? monthStart : startDate,
			endDate: monthEnd < endDate ? monthEnd : endDate,
			availableDays: available,
			assignedDays: assigned,
			openSlots: Math.max(0, available - assigned),
			utilizationPercent: available > 0 ? Math.round((assigned / available) * 100) : 0
		});
	}

	// Build calendar with availability and assignments - use UTC to avoid timezone shifts
	const calendarData: Array<{ date: string; availability?: 'available' | 'unavailable' | 'unset'; assignedStudent?: any; assignment?: any }> = [];

	const current = parseUTCDate(startDate);
	const end = parseUTCDate(endDate);

	while (current <= end) {
		const dateStr = formatUTCDate(current);
		const isAvailable = availabilityMap.get(dateStr);
		const assignment = assignmentByDate.get(dateStr);

		calendarData.push({
			date: dateStr,
			availability: isAvailable === true ? 'available' : isAvailable === false ? 'unavailable' : 'unset',
			assignedStudent: assignment ? {
				id: assignment.student_id,
				name: assignment.student_name,
				initials: getInitials(assignment.student_name)
			} : undefined,
			assignment: assignment ? {
				id: assignment.id as string,
				clerkshipId: assignment.clerkship_id,
				clerkshipName: assignment.clerkship_name,
				preceptorId: preceptorId,
				preceptorName: preceptor.name,
				color: getClerkshipColor(assignment.clerkship_specialty ?? 'General')
			} : undefined
		});

		current.setUTCDate(current.getUTCDate() + 1);
	}

	const calendar = buildCalendarMonthsWithAvailability(startDate, endDate, calendarData);

	// Group assignments by student
	const studentAssignments = new Map<string, {
		studentId: string;
		studentName: string;
		clerkshipId: string;
		clerkshipName: string;
		dates: string[]
	}>();

	for (const a of assignments) {
		const key = `${a.student_id}-${a.clerkship_id}`;
		if (!studentAssignments.has(key)) {
			studentAssignments.set(key, {
				studentId: a.student_id,
				studentName: a.student_name,
				clerkshipId: a.clerkship_id,
				clerkshipName: a.clerkship_name,
				dates: []
			});
		}
		studentAssignments.get(key)!.dates.push(a.date);
	}

	const assignedStudents = Array.from(studentAssignments.values()).map((s) => ({
		studentId: s.studentId,
		studentName: s.studentName,
		clerkshipId: s.clerkshipId,
		clerkshipName: s.clerkshipName,
		daysAssigned: s.dates.length,
		dateRange: {
			start: s.dates[0],
			end: s.dates[s.dates.length - 1]
		}
	}));

	// Format assignments list
	const formattedAssignments: PreceptorAssignment[] = assignments.map((a) => ({
		id: a.id as string,
		date: a.date,
		studentId: a.student_id,
		studentName: a.student_name,
		studentInitials: getInitials(a.student_name),
		clerkshipId: a.clerkship_id,
		clerkshipName: a.clerkship_name,
		clerkshipColor: getClerkshipColor(a.clerkship_specialty ?? 'General'),
		status: a.status,
		source: a.source,
		locked: Boolean(a.locked),
		electiveId: a.elective_id ?? undefined,
		electiveName: a.elective_name ?? undefined,
		overrideCodes: parseCodes(a.override_codes)
	}));

	log.info('Preceptor schedule data fetched', {
		preceptorId,
		preceptorName: preceptor.name,
		totalAvailableDays: totalAvailable,
		totalAssignedDays: totalAssigned,
		openSlots: Math.max(0, totalAvailable - totalAssigned),
		utilizationPercent: totalAvailable > 0 ? Math.round((totalAssigned / totalAvailable) * 100) : 0,
		uniqueStudents: assignedStudents.length
	});

	return {
		preceptor: {
			id: preceptor.id as string,
			name: preceptor.name,
			email: preceptor.email,
			healthSystemName: preceptor.health_system_name || undefined
		},
		period: period ? {
			id: period.id as string,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		} : null,
		monthlyCapacity,
		overallCapacity: {
			availableDays: totalAvailable,
			assignedDays: totalAssigned,
			openSlots: Math.max(0, totalAvailable - totalAssigned),
			utilizationPercent: totalAvailable > 0 ? Math.round((totalAssigned / totalAvailable) * 100) : 0
		},
		calendar,
		assignedStudents,
		assignments: formattedAssignments
	};
}

// ============================================================================
// Schedule Summary
// ============================================================================

/**
 * Get overall schedule results summary
 */
export async function getScheduleSummaryData(
	db: Kysely<DB>,
	scheduleId: string | null
): Promise<ScheduleResultsSummary> {
	log.debug('Fetching schedule summary data', { scheduleId });

	// Resolve the range from the caller's active schedule; no schedule → empty summary.
	const period = await resolvePeriod(db, scheduleId);
	if (!period) {
		return emptyScheduleSummary();
	}
	const startDate = period.start_date;
	const endDate = period.end_date;

	// Students in THIS schedule only (review finding F-27): the summary must not
	// count other tenants' students as unscheduled.
	const students = await db
		.selectFrom('students')
		.innerJoin('schedule_students', 'schedule_students.student_id', 'students.id')
		.select(['students.id as id', 'students.name as name'])
		.where('schedule_students.schedule_id', '=', scheduleId!)
		.execute();

	// Clerkships in THIS schedule only.
	const clerkships = await db
		.selectFrom('clerkships')
		.innerJoin('schedule_clerkships', 'schedule_clerkships.clerkship_id', 'clerkships.id')
		.select([
			'clerkships.id as id',
			'clerkships.name as name',
			'clerkships.specialty as specialty',
			'clerkships.required_days as required_days'
		])
		.where('schedule_clerkships.schedule_id', '=', scheduleId!)
		.execute();

	// Assignments in THIS schedule and period. Scope through the schedule's own
	// students (the tenant boundary, F-27) rather than the assignment's
	// schedule_id column, so rows created before that column existed still count.
	const scopedStudentIds = students.map((s) => s.id).filter((id): id is string => !!id);
	const assignments =
		scopedStudentIds.length > 0
			? await db
					.selectFrom('schedule_assignments')
					.select(['id', 'student_id', 'preceptor_id', 'clerkship_id', 'date'])
					.where('student_id', 'in', scopedStudentIds)
					.where('date', '>=', startDate)
					.where('date', '<=', endDate)
					.execute()
			: [];

	// Count assignments by student and clerkship
	const studentClerkshipCounts = new Map<string, Map<string, number>>();

	for (const a of assignments) {
		if (!studentClerkshipCounts.has(a.student_id)) {
			studentClerkshipCounts.set(a.student_id, new Map());
		}
		const clerkshipCounts = studentClerkshipCounts.get(a.student_id)!;
		clerkshipCounts.set(a.clerkship_id, (clerkshipCounts.get(a.clerkship_id) || 0) + 1);
	}

	// Calculate unmet requirements
	const studentsWithUnmetRequirements: StudentWithUnmetRequirements[] = [];
	let studentsFullyScheduled = 0;
	let studentsPartiallyScheduled = 0;
	let studentsWithNoAssignments = 0;

	for (const student of students) {
		const clerkshipCounts = studentClerkshipCounts.get(student.id as string) || new Map();
		const unmetClerkships: StudentWithUnmetRequirements['unmetClerkships'] = [];
		let hasAnyAssignment = false;
		let allMet = true;

		for (const clerkship of clerkships) {
			const assigned = clerkshipCounts.get(clerkship.id) || 0;
			if (assigned > 0) hasAnyAssignment = true;

			if (assigned < clerkship.required_days) {
				allMet = false;
				unmetClerkships.push({
					clerkshipId: clerkship.id as string,
					clerkshipName: clerkship.name,
					requiredDays: clerkship.required_days,
					assignedDays: assigned,
					gap: clerkship.required_days - assigned
				});
			}
		}

		if (!hasAnyAssignment) {
			studentsWithNoAssignments++;
		} else if (allMet) {
			studentsFullyScheduled++;
		} else {
			studentsPartiallyScheduled++;
		}

		if (unmetClerkships.length > 0) {
			studentsWithUnmetRequirements.push({
				studentId: student.id as string,
				studentName: student.name,
				unmetClerkships,
				totalGap: unmetClerkships.reduce((sum, c) => sum + c.gap, 0)
			});
		}
	}

	// Sort by total gap descending
	studentsWithUnmetRequirements.sort((a, b) => b.totalGap - a.totalGap);

	// Calculate clerkship breakdown
	const clerkshipAssignments = new Map<string, { count: number; students: Set<string> }>();
	for (const a of assignments) {
		if (!clerkshipAssignments.has(a.clerkship_id)) {
			clerkshipAssignments.set(a.clerkship_id, { count: 0, students: new Set() });
		}
		const entry = clerkshipAssignments.get(a.clerkship_id)!;
		entry.count++;
		entry.students.add(a.student_id);
	}

	const clerkshipBreakdown = clerkships.map((c) => {
		const entry = clerkshipAssignments.get(c.id as string) || { count: 0, students: new Set() };
		return {
			clerkshipId: c.id as string,
			clerkshipName: c.name,
			totalAssignments: entry.count,
			studentsAssigned: entry.students.size,
			averageDaysPerStudent: entry.students.size > 0 ? Math.round(entry.count / entry.students.size) : 0
		};
	});

	// Count unique preceptors
	const uniquePreceptors = new Set(assignments.map((a) => a.preceptor_id));

	log.info('Schedule summary data fetched', {
		totalAssignments: assignments.length,
		totalStudents: students.length,
		totalPreceptors: uniquePreceptors.size,
		studentsFullyScheduled,
		studentsPartiallyScheduled,
		studentsWithNoAssignments,
		studentsWithUnmetRequirements: studentsWithUnmetRequirements.length,
		isComplete: studentsWithUnmetRequirements.length === 0
	});

	return {
		period: period ? {
			id: period.id as string,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		} : null,
		stats: {
			totalAssignments: assignments.length,
			totalStudents: students.length,
			totalPreceptors: uniquePreceptors.size,
			studentsFullyScheduled,
			studentsPartiallyScheduled,
			studentsWithNoAssignments
		},
		studentsWithUnmetRequirements,
		clerkshipBreakdown,
		isComplete: studentsWithUnmetRequirements.length === 0
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve a schedule id to its period row. Returns null when the id is null or
 * the row is missing — callers must handle the "no active schedule" case rather
 * than falling back to a fabricated date range.
 */
async function resolvePeriod(
	db: Kysely<DB>,
	scheduleId: string | null
): Promise<{ id: string | null; name: string; start_date: string; end_date: string } | null> {
	if (!scheduleId) return null;
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['id', 'name', 'start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();
	return period ?? null;
}

function emptyStudentSchedule(student: {
	id: string | null;
	name: string;
	email: string;
}): StudentSchedule {
	return {
		student: { id: student.id as string, name: student.name, email: student.email },
		period: null,
		clerkshipProgress: [],
		summary: {
			totalAssignedDays: 0,
			totalRequiredDays: 0,
			overallPercentComplete: 0,
			clerkshipsComplete: 0,
			clerkshipsTotal: 0,
			clerkshipsWithNoAssignments: 0
		},
		calendar: [],
		assignments: []
	};
}

function emptyPreceptorSchedule(preceptor: {
	id: string | null;
	name: string;
	email: string;
	health_system_name: string | null;
}): PreceptorSchedule {
	return {
		preceptor: {
			id: preceptor.id as string,
			name: preceptor.name,
			email: preceptor.email,
			healthSystemName: preceptor.health_system_name || undefined
		},
		period: null,
		monthlyCapacity: [],
		overallCapacity: { availableDays: 0, assignedDays: 0, openSlots: 0, utilizationPercent: 0 },
		calendar: [],
		assignedStudents: [],
		assignments: []
	};
}

function emptyScheduleSummary(): ScheduleResultsSummary {
	return {
		period: null,
		stats: {
			totalAssignments: 0,
			totalStudents: 0,
			totalPreceptors: 0,
			studentsFullyScheduled: 0,
			studentsPartiallyScheduled: 0,
			studentsWithNoAssignments: 0
		},
		studentsWithUnmetRequirements: [],
		clerkshipBreakdown: [],
		isComplete: true
	};
}

function getClerkshipColor(specialty: string): string {
	const colors = [
		'#3b82f6', '#10b981', '#f59e0b', '#ef4444',
		'#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
	];
	let hash = 0;
	for (let i = 0; i < specialty.length; i++) {
		hash = specialty.charCodeAt(i) + ((hash << 5) - hash);
	}
	return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
	return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function buildCalendarMonths(
	startDate: string,
	endDate: string,
	assignments: Array<{ date: string; assignment: any }>
): CalendarMonth[] {
	// Build map that collects all assignments per date
	const assignmentMap = new Map<string, any[]>();
	for (const a of assignments) {
		if (!assignmentMap.has(a.date)) {
			assignmentMap.set(a.date, []);
		}
		assignmentMap.get(a.date)!.push(a.assignment);
	}

	const months = getMonthsBetween(startDate, endDate);
	const result: CalendarMonth[] = [];
	const today = getTodayUTC();

	for (const { year, month, name } of months) {
		const weeks: CalendarWeek[] = [];
		// Use UTC to avoid timezone shifts
		const firstDay = new Date(Date.UTC(year, month - 1, 1));
		const lastDay = new Date(Date.UTC(year, month, 0));

		// Start from Sunday of the week containing the 1st
		const weekStart = new Date(firstDay);
		weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

		let weekNumber = 1;
		let currentDate = new Date(weekStart);

		while (currentDate <= lastDay || currentDate.getUTCDay() !== 0) {
			const days: CalendarDay[] = [];

			for (let i = 0; i < 7; i++) {
				const dateStr = formatUTCDate(currentDate);
				const dayOfMonth = currentDate.getUTCDate();
				const isCurrentMonth = currentDate.getUTCMonth() === month - 1;
				const dayOfWeek = currentDate.getUTCDay();
				const dayAssignments = assignmentMap.get(dateStr) || [];

				days.push({
					date: dateStr,
					dayOfMonth,
					dayOfWeek,
					isCurrentMonth,
					isInRange: dateStr >= startDate && dateStr <= endDate,
					isToday: dateStr === today,
					isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
					assignments: dayAssignments,
					// Keep assignment for backward compatibility
					assignment: dayAssignments[0]
				});

				currentDate.setUTCDate(currentDate.getUTCDate() + 1);
			}

			weeks.push({ weekNumber, days });
			weekNumber++;

			if (currentDate > lastDay && currentDate.getUTCDay() === 0) break;
		}

		result.push({ year, month, monthName: name, weeks });
	}

	return result;
}

function buildCalendarMonthsWithAvailability(
	startDate: string,
	endDate: string,
	data: Array<{ date: string; availability?: 'available' | 'unavailable' | 'unset'; assignedStudent?: any; assignment?: any }>
): CalendarMonth[] {
	// Collect all data per date (supports multiple assignments per day)
	const dataMap = new Map<string, Array<typeof data[0]>>();
	for (const d of data) {
		if (!dataMap.has(d.date)) {
			dataMap.set(d.date, []);
		}
		dataMap.get(d.date)!.push(d);
	}

	const months = getMonthsBetween(startDate, endDate);
	const result: CalendarMonth[] = [];
	const today = getTodayUTC();

	for (const { year, month, name } of months) {
		const weeks: CalendarWeek[] = [];
		// Use UTC to avoid timezone shifts
		const firstDay = new Date(Date.UTC(year, month - 1, 1));
		const lastDay = new Date(Date.UTC(year, month, 0));

		const weekStart = new Date(firstDay);
		weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

		let weekNumber = 1;
		let currentDate = new Date(weekStart);

		while (currentDate <= lastDay || currentDate.getUTCDay() !== 0) {
			const days: CalendarDay[] = [];

			for (let i = 0; i < 7; i++) {
				const dateStr = formatUTCDate(currentDate);
				const dayOfMonth = currentDate.getUTCDate();
				const isCurrentMonth = currentDate.getUTCMonth() === month - 1;
				const dayOfWeek = currentDate.getUTCDay();
				const dayDataList = dataMap.get(dateStr) || [];
				const firstDayData = dayDataList[0];

				// Collect all assignments for the day
				const dayAssignments = dayDataList
					.filter(d => d.assignment)
					.map(d => d.assignment);

				days.push({
					date: dateStr,
					dayOfMonth,
					dayOfWeek,
					isCurrentMonth,
					isInRange: dateStr >= startDate && dateStr <= endDate,
					isToday: dateStr === today,
					isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
					assignments: dayAssignments,
					// Keep assignment for backward compatibility
					assignment: firstDayData?.assignment,
					availability: firstDayData?.availability,
					assignedStudent: firstDayData?.assignedStudent
				});

				currentDate.setUTCDate(currentDate.getUTCDate() + 1);
			}

			weeks.push({ weekNumber, days });
			weekNumber++;

			if (currentDate > lastDay && currentDate.getUTCDay() === 0) break;
		}

		result.push({ year, month, monthName: name, weeks });
	}

	return result;
}
