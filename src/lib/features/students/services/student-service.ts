/**
 * Student Service Layer
 *
 * Business logic and database operations for students
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, Students } from '$lib/db/types';
import type { CreateStudentInput, UpdateStudentInput } from '../schemas.js';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { sql } from 'kysely';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:students');

/**
 * Get all students, ordered by name
 */
export async function getStudents(db: Kysely<DB>): Promise<Selectable<Students>[]> {
	return await db.selectFrom('students').selectAll().orderBy('name', 'asc').execute();
}

/**
 * Get students filtered by schedule ID
 * Returns only students associated with the given schedule
 * @throws {Error} If scheduleId is not provided
 */
export async function getStudentsBySchedule(
	db: Kysely<DB>,
	scheduleId: string
): Promise<Selectable<Students>[]> {
	if (!scheduleId) {
		throw new Error('Schedule ID is required');
	}

	return await db
		.selectFrom('students')
		.innerJoin('schedule_students', 'students.id', 'schedule_students.student_id')
		.where('schedule_students.schedule_id', '=', scheduleId)
		.select([
			'students.id',
			'students.name',
			'students.email',
			'students.created_at',
			'students.updated_at'
		])
		.orderBy('students.name', 'asc')
		.execute();
}

/**
 * Get a single student by ID
 * @returns Student or null if not found
 */
export async function getStudentById(db: Kysely<DB>, id: string): Promise<Selectable<Students> | null> {
	const student = await db.selectFrom('students').selectAll().where('id', '=', id).executeTakeFirst();

	return student || null;
}

/**
 * Get a student by email (case-insensitive)
 * @returns Student or null if not found
 */
export async function getStudentByEmail(
	db: Kysely<DB>,
	email: string
): Promise<Selectable<Students> | null> {
	const student = await db
		.selectFrom('students')
		.selectAll()
		.where(sql`lower(email)`, '=', email.toLowerCase())
		.executeTakeFirst();

	return student || null;
}

/**
 * Create a new student
 * @throws {ConflictError} If email already exists
 */
export async function createStudent(
	db: Kysely<DB>,
	data: CreateStudentInput
): Promise<Selectable<Students>> {
	log.debug('Creating student', {
		name: data.name,
		email: data.email
	});

	// Check if email is already taken
	const existingStudent = await getStudentByEmail(db, data.email);
	if (existingStudent) {
		log.warn('Student creation failed - email already exists', { email: data.email });
		throw new ConflictError('Email already exists');
	}

	const timestamp = new Date().toISOString();
	const newStudent = {
		id: crypto.randomUUID(),
		name: data.name,
		email: data.email,
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('students')
		.values(newStudent)
		.returningAll()
		.executeTakeFirstOrThrow();

	log.info('Student created', {
		id: inserted.id,
		name: inserted.name,
		email: inserted.email
	});

	return inserted;
}

/**
 * Update an existing student
 * @throws {NotFoundError} If student not found
 * @throws {ConflictError} If new email is already taken
 */
export async function updateStudent(
	db: Kysely<DB>,
	id: string,
	data: UpdateStudentInput
): Promise<Selectable<Students>> {
	log.debug('Updating student', {
		id,
		updates: Object.keys(data)
	});

	// Check if student exists
	const exists = await studentExists(db, id);
	if (!exists) {
		log.warn('Student not found for update', { id });
		throw new NotFoundError('Student');
	}

	// If email is being updated, check if it's taken by another student
	if (data.email) {
		const emailTaken = await isEmailTaken(db, data.email, id);
		if (emailTaken) {
			log.warn('Student update failed - email already exists', { id, email: data.email });
			throw new ConflictError('Email already exists');
		}
	}

	const updated = await db
		.updateTable('students')
		.set({
			...data,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	log.info('Student updated', {
		id: updated.id,
		name: updated.name,
		updatedFields: Object.keys(data)
	});

	return updated;
}

/**
 * Delete a student
 * @throws {NotFoundError} If student not found
 * @throws {ConflictError} If student has schedule assignments
 */
export async function deleteStudent(db: Kysely<DB>, id: string): Promise<void> {
	log.debug('Deleting student', { id });

	// Check if student exists
	const exists = await studentExists(db, id);
	if (!exists) {
		log.warn('Student not found for deletion', { id });
		throw new NotFoundError('Student');
	}

	// Check if student can be deleted
	const canDelete = await canDeleteStudent(db, id);
	if (!canDelete) {
		log.warn('Cannot delete student with existing assignments', { id });
		throw new ConflictError('Cannot delete student with existing schedule assignments');
	}

	await db.deleteFrom('students').where('id', '=', id).execute();

	log.info('Student deleted', { id });
}

/**
 * Check if a student can be deleted (has no assignments)
 */
export async function canDeleteStudent(db: Kysely<DB>, id: string): Promise<boolean> {
	const assignment = await db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('student_id', '=', id)
		.executeTakeFirst();

	return !assignment;
}

/**
 * Check if a student exists
 */
export async function studentExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const student = await getStudentById(db, id);
	return student !== null;
}

/**
 * Check if an email is already taken
 * @param excludeId Optional student ID to exclude from check (for updates)
 */
export async function isEmailTaken(
	db: Kysely<DB>,
	email: string,
	excludeId?: string
): Promise<boolean> {
	let query = db
		.selectFrom('students')
		.select('id')
		.where(sql`lower(email)`, '=', email.toLowerCase());

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const student = await query.executeTakeFirst();
	return !!student;
}

/**
 * Student with onboarding stats
 */
export interface StudentWithOnboarding extends Selectable<Students> {
	completed_onboarding: number;
	total_health_systems: number;
}

/**
 * Get all students with their onboarding completion stats
 */
export async function getStudentsWithOnboardingStats(
	db: Kysely<DB>
): Promise<StudentWithOnboarding[]> {
	// Get total health systems count
	const healthSystemCount = await db
		.selectFrom('health_systems')
		.select(sql<number>`count(*)`.as('count'))
		.executeTakeFirst();

	const totalHealthSystems = Number(healthSystemCount?.count || 0);

	// Get students with completed onboarding count
	const students = await db
		.selectFrom('students')
		.leftJoin(
			'student_health_system_onboarding',
			'students.id',
			'student_health_system_onboarding.student_id'
		)
		.select([
			'students.id',
			'students.name',
			'students.email',
			'students.created_at',
			'students.updated_at',
			sql<number>`sum(case when student_health_system_onboarding.is_completed = 1 then 1 else 0 end)`.as(
				'completed_onboarding'
			)
		])
		.groupBy('students.id')
		.orderBy('students.name', 'asc')
		.execute();

	return students.map((s) => ({
		...s,
		completed_onboarding: Number(s.completed_onboarding || 0),
		total_health_systems: totalHealthSystems
	}));
}

/**
 * Get students with their onboarding completion stats, filtered by schedule ID
 * @throws {Error} If scheduleId is not provided
 */
export async function getStudentsWithOnboardingStatsBySchedule(
	db: Kysely<DB>,
	scheduleId: string
): Promise<StudentWithOnboarding[]> {
	if (!scheduleId) {
		throw new Error('Schedule ID is required');
	}

	// Get total health systems count
	const healthSystemCount = await db
		.selectFrom('health_systems')
		.select(sql<number>`count(*)`.as('count'))
		.executeTakeFirst();

	const totalHealthSystems = Number(healthSystemCount?.count || 0);

	// Get students with completed onboarding count, filtered by schedule
	const students = await db
		.selectFrom('students')
		.innerJoin('schedule_students', 'students.id', 'schedule_students.student_id')
		.leftJoin(
			'student_health_system_onboarding',
			'students.id',
			'student_health_system_onboarding.student_id'
		)
		.where('schedule_students.schedule_id', '=', scheduleId)
		.select([
			'students.id',
			'students.name',
			'students.email',
			'students.created_at',
			'students.updated_at',
			sql<number>`sum(case when student_health_system_onboarding.is_completed = 1 then 1 else 0 end)`.as(
				'completed_onboarding'
			)
		])
		.groupBy('students.id')
		.orderBy('students.name', 'asc')
		.execute();

	return students.map((s) => ({
		...s,
		completed_onboarding: Number(s.completed_onboarding || 0),
		total_health_systems: totalHealthSystems
	}));
}
