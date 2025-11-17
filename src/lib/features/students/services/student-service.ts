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

/**
 * Get all students, ordered by name
 */
export async function getStudents(db: Kysely<DB>): Promise<Selectable<Students>[]> {
	return await db.selectFrom('students').selectAll().orderBy('name', 'asc').execute();
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
	// Check if email is already taken
	const existingStudent = await getStudentByEmail(db, data.email);
	if (existingStudent) {
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
	// Check if student exists
	const exists = await studentExists(db, id);
	if (!exists) {
		throw new NotFoundError('Student');
	}

	// If email is being updated, check if it's taken by another student
	if (data.email) {
		const emailTaken = await isEmailTaken(db, data.email, id);
		if (emailTaken) {
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

	return updated;
}

/**
 * Delete a student
 * @throws {NotFoundError} If student not found
 * @throws {ConflictError} If student has schedule assignments
 */
export async function deleteStudent(db: Kysely<DB>, id: string): Promise<void> {
	// Check if student exists
	const exists = await studentExists(db, id);
	if (!exists) {
		throw new NotFoundError('Student');
	}

	// Check if student can be deleted
	const canDelete = await canDeleteStudent(db, id);
	if (!canDelete) {
		throw new ConflictError('Cannot delete student with existing schedule assignments');
	}

	await db.deleteFrom('students').where('id', '=', id).execute();
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
