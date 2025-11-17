/**
 * Schedule Assignment Service Layer
 *
 * Business logic and database operations for schedule assignments
 */

import type { Kysely } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';
import type { CreateAssignmentInput, UpdateAssignmentInput, BulkAssignmentInput, AssignmentFilters } from '../schemas';
import { NotFoundError, ConflictError, ValidationError } from '$lib/api/errors';
import { getStudentById } from '$lib/features/students/services/student-service';
import { getPreceptorById } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkshipById } from '$lib/features/clerkships/services/clerkship-service';
import { isDateBlackedOut } from '$lib/features/blackout-dates/services/blackout-date-service';
import { getAvailabilityByDate } from '$lib/features/preceptors/services/availability-service';

/**
 * Get all assignments with optional filters
 */
export async function getAssignments(
	db: Kysely<DB>,
	filters?: AssignmentFilters
): Promise<ScheduleAssignments[]> {
	let query = db.selectFrom('schedule_assignments').selectAll();

	if (filters?.student_id) {
		query = query.where('student_id', '=', filters.student_id);
	}

	if (filters?.preceptor_id) {
		query = query.where('preceptor_id', '=', filters.preceptor_id);
	}

	if (filters?.clerkship_id) {
		query = query.where('clerkship_id', '=', filters.clerkship_id);
	}

	if (filters?.start_date && filters?.end_date) {
		query = query
			.where('date', '>=', filters.start_date)
			.where('date', '<=', filters.end_date);
	} else if (filters?.start_date) {
		query = query.where('date', '>=', filters.start_date);
	} else if (filters?.end_date) {
		query = query.where('date', '<=', filters.end_date);
	}

	return await query.orderBy('date', 'asc').execute();
}

/**
 * Get a single assignment by ID
 * @returns Assignment or null if not found
 */
export async function getAssignmentById(
	db: Kysely<DB>,
	id: string
): Promise<ScheduleAssignments | null> {
	const assignment = await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return assignment || null;
}

/**
 * Get all assignments for a student
 */
export async function getAssignmentsByStudent(
	db: Kysely<DB>,
	studentId: string
): Promise<ScheduleAssignments[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get all assignments for a preceptor
 */
export async function getAssignmentsByPreceptor(
	db: Kysely<DB>,
	preceptorId: string
): Promise<ScheduleAssignments[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get assignments within a date range
 */
export async function getAssignmentsByDateRange(
	db: Kysely<DB>,
	startDate: string,
	endDate: string
): Promise<ScheduleAssignments[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('date', '>=', startDate)
		.where('date', '<=', endDate)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Create a new assignment
 * @throws {ValidationError} If assignment validation fails
 */
export async function createAssignment(
	db: Kysely<DB>,
	data: CreateAssignmentInput
): Promise<ScheduleAssignments> {
	// Validate assignment
	const validation = await validateAssignment(db, data);
	if (!validation.valid) {
		throw new ValidationError(validation.errors.join('; '));
	}

	const timestamp = new Date().toISOString();
	const newAssignment: Omit<ScheduleAssignments, 'id'> & { id?: string } = {
		id: crypto.randomUUID(),
		student_id: data.student_id,
		preceptor_id: data.preceptor_id,
		clerkship_id: data.clerkship_id,
		date: data.date,
		status: data.status || 'scheduled',
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('schedule_assignments')
		.values(newAssignment)
		.returningAll()
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * Update an existing assignment
 * @throws {NotFoundError} If assignment not found
 * @throws {ValidationError} If updated assignment validation fails
 */
export async function updateAssignment(
	db: Kysely<DB>,
	id: string,
	data: UpdateAssignmentInput
): Promise<ScheduleAssignments> {
	// Check if assignment exists
	const exists = await assignmentExists(db, id);
	if (!exists) {
		throw new NotFoundError('Assignment');
	}

	// If updating critical fields, validate the updated assignment
	if (data.student_id || data.preceptor_id || data.clerkship_id || data.date) {
		const current = await getAssignmentById(db, id);
		if (!current) {
			throw new NotFoundError('Assignment');
		}

		const mergedData: CreateAssignmentInput = {
			student_id: data.student_id || current.student_id,
			preceptor_id: data.preceptor_id || current.preceptor_id,
			clerkship_id: data.clerkship_id || current.clerkship_id,
			date: data.date || current.date,
			status: data.status || current.status
		};

		const validation = await validateAssignment(db, mergedData, id);
		if (!validation.valid) {
			throw new ValidationError(validation.errors.join('; '));
		}
	}

	const updated = await db
		.updateTable('schedule_assignments')
		.set({
			...data,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	return updated;
}

/**
 * Delete an assignment
 * @throws {NotFoundError} If assignment not found
 */
export async function deleteAssignment(db: Kysely<DB>, id: string): Promise<void> {
	const exists = await assignmentExists(db, id);
	if (!exists) {
		throw new NotFoundError('Assignment');
	}

	await db.deleteFrom('schedule_assignments').where('id', '=', id).execute();
}

/**
 * Bulk create assignments (for algorithm output)
 */
export async function bulkCreateAssignments(
	db: Kysely<DB>,
	data: BulkAssignmentInput
): Promise<ScheduleAssignments[]> {
	// Handle empty array case
	if (data.assignments.length === 0) {
		return [];
	}

	const timestamp = new Date().toISOString();
	const assignments = data.assignments.map((assignment) => ({
		id: crypto.randomUUID(),
		student_id: assignment.student_id,
		preceptor_id: assignment.preceptor_id,
		clerkship_id: assignment.clerkship_id,
		date: assignment.date,
		status: assignment.status || 'scheduled',
		created_at: timestamp,
		updated_at: timestamp
	}));

	const inserted = await db
		.insertInto('schedule_assignments')
		.values(assignments)
		.returningAll()
		.execute();

	return inserted;
}

/**
 * Check if a student has a conflicting assignment on a specific date
 * @param excludeId Optional assignment ID to exclude from conflict check (for updates)
 */
export async function hasStudentConflict(
	db: Kysely<DB>,
	studentId: string,
	date: string,
	excludeId?: string
): Promise<boolean> {
	let query = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('student_id', '=', studentId)
		.where('date', '=', date);

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const conflict = await query.executeTakeFirst();
	return !!conflict;
}

/**
 * Check if a preceptor has reached capacity on a specific date
 * @param excludeId Optional assignment ID to exclude from conflict check (for updates)
 */
export async function hasPreceptorConflict(
	db: Kysely<DB>,
	preceptorId: string,
	date: string,
	excludeId?: string
): Promise<boolean> {
	const preceptor = await getPreceptorById(db, preceptorId);
	if (!preceptor) {
		return true;
	}

	let query = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('preceptor_id', '=', preceptorId)
		.where('date', '=', date);

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const conflicts = await query.execute();
	return conflicts.length >= preceptor.max_students;
}

/**
 * Validate an assignment against business rules
 * @param excludeId Optional assignment ID to exclude from conflict checks (for updates)
 */
export async function validateAssignment(
	db: Kysely<DB>,
	data: CreateAssignmentInput,
	excludeId?: string
): Promise<{ valid: boolean; errors: string[] }> {
	const errors: string[] = [];

	// Check that entities exist
	const student = await getStudentById(db, data.student_id);
	if (!student) {
		errors.push('Student not found');
	}

	const preceptor = await getPreceptorById(db, data.preceptor_id);
	if (!preceptor) {
		errors.push('Preceptor not found');
	}

	const clerkship = await getClerkshipById(db, data.clerkship_id);
	if (!clerkship) {
		errors.push('Clerkship not found');
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	// Check specialty matching
	if (preceptor && clerkship && preceptor.specialty !== clerkship.specialty) {
		errors.push(
			`Preceptor specialty (${preceptor.specialty}) does not match clerkship specialty (${clerkship.specialty})`
		);
	}

	// Check for student conflicts (no double-booking)
	const studentConflict = await hasStudentConflict(db, data.student_id, data.date, excludeId);
	if (studentConflict) {
		errors.push('Student already has an assignment on this date');
	}

	// Check for preceptor capacity
	const preceptorConflict = await hasPreceptorConflict(db, data.preceptor_id, data.date, excludeId);
	if (preceptorConflict) {
		errors.push('Preceptor has reached maximum student capacity for this date');
	}

	// Check preceptor availability
	const availability = await getAvailabilityByDate(db, data.preceptor_id, data.date);
	if (availability && availability.is_available === 0) {
		errors.push(`Preceptor is not available on ${data.date}`);
	}

	// Check for blackout dates
	const isBlackedOut = await isDateBlackedOut(db, data.date);
	if (isBlackedOut) {
		errors.push(`${data.date} is a blackout date`);
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Get student progress for all clerkships
 */
export async function getStudentProgress(
	db: Kysely<DB>,
	studentId: string
): Promise<
	{
		clerkship_id: string;
		clerkship_name: string;
		required_days: number;
		completed_days: number;
		percentage: number;
	}[]
> {
	const assignments = await getAssignmentsByStudent(db, studentId);
	const clerkships = await db.selectFrom('clerkships').selectAll().execute();

	const progress = clerkships.map((clerkship) => {
		const completedDays = assignments.filter((a) => a.clerkship_id === clerkship.id).length;
		const percentage = Math.min(100, Math.round((completedDays / clerkship.required_days) * 100));

		return {
			clerkship_id: clerkship.id,
			clerkship_name: clerkship.name,
			required_days: clerkship.required_days,
			completed_days: completedDays,
			percentage
		};
	});

	return progress;
}

/**
 * Check if an assignment exists
 */
export async function assignmentExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const assignment = await getAssignmentById(db, id);
	return assignment !== null;
}
