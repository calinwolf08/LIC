/**
 * Preceptor Service Layer
 *
 * Business logic and database operations for preceptors
 */

import type { Kysely } from 'kysely';
import type { DB, Preceptors } from '$lib/db/types';
import type { CreatePreceptorInput, UpdatePreceptorInput } from '../schemas';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { sql } from 'kysely';

/**
 * Get all preceptors, ordered by name
 */
export async function getPreceptors(db: Kysely<DB>): Promise<Preceptors[]> {
	return await db.selectFrom('preceptors').selectAll().orderBy('name', 'asc').execute();
}

/**
 * Get a single preceptor by ID
 * @returns Preceptor or null if not found
 */
export async function getPreceptorById(
	db: Kysely<DB>,
	id: string
): Promise<Preceptors | null> {
	const preceptor = await db
		.selectFrom('preceptors')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return preceptor || null;
}

/**
 * Get all preceptors with a specific specialty
 */
export async function getPreceptorsBySpecialty(
	db: Kysely<DB>,
	specialty: string
): Promise<Preceptors[]> {
	return await db
		.selectFrom('preceptors')
		.selectAll()
		.where('specialty', '=', specialty)
		.orderBy('name', 'asc')
		.execute();
}

/**
 * Get a preceptor by email (case-insensitive)
 * @returns Preceptor or null if not found
 */
export async function getPreceptorByEmail(
	db: Kysely<DB>,
	email: string
): Promise<Preceptors | null> {
	const preceptor = await db
		.selectFrom('preceptors')
		.selectAll()
		.where(sql`lower(email)`, '=', email.toLowerCase())
		.executeTakeFirst();

	return preceptor || null;
}

/**
 * Create a new preceptor
 * @throws {ConflictError} If email already exists
 */
export async function createPreceptor(
	db: Kysely<DB>,
	data: CreatePreceptorInput
): Promise<Preceptors> {
	// Check if email is already taken
	const existingPreceptor = await getPreceptorByEmail(db, data.email);
	if (existingPreceptor) {
		throw new ConflictError('Email already exists');
	}

	const timestamp = new Date().toISOString();
	const newPreceptor: Omit<Preceptors, 'id'> & { id?: string } = {
		id: crypto.randomUUID(),
		name: data.name,
		email: data.email,
		specialty: data.specialty,
		max_students: data.max_students ?? 1,
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('preceptors')
		.values(newPreceptor)
		.returningAll()
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * Update an existing preceptor
 * @throws {NotFoundError} If preceptor not found
 * @throws {ConflictError} If new email is already taken
 */
export async function updatePreceptor(
	db: Kysely<DB>,
	id: string,
	data: UpdatePreceptorInput
): Promise<Preceptors> {
	// Check if preceptor exists
	const exists = await preceptorExists(db, id);
	if (!exists) {
		throw new NotFoundError('Preceptor');
	}

	// If email is being updated, check if it's taken by another preceptor
	if (data.email) {
		const emailTaken = await isEmailTaken(db, data.email, id);
		if (emailTaken) {
			throw new ConflictError('Email already exists');
		}
	}

	const updated = await db
		.updateTable('preceptors')
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
 * Delete a preceptor
 * @throws {NotFoundError} If preceptor not found
 * @throws {ConflictError} If preceptor has schedule assignments
 */
export async function deletePreceptor(db: Kysely<DB>, id: string): Promise<void> {
	// Check if preceptor exists
	const exists = await preceptorExists(db, id);
	if (!exists) {
		throw new NotFoundError('Preceptor');
	}

	// Check if preceptor can be deleted
	const canDelete = await canDeletePreceptor(db, id);
	if (!canDelete) {
		throw new ConflictError('Cannot delete preceptor with existing schedule assignments');
	}

	// Delete will cascade to preceptor_availability
	await db.deleteFrom('preceptors').where('id', '=', id).execute();
}

/**
 * Check if a preceptor can be deleted (has no assignments)
 */
export async function canDeletePreceptor(db: Kysely<DB>, id: string): Promise<boolean> {
	const assignment = await db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('preceptor_id', '=', id)
		.executeTakeFirst();

	return !assignment;
}

/**
 * Check if a preceptor exists
 */
export async function preceptorExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const preceptor = await getPreceptorById(db, id);
	return preceptor !== null;
}

/**
 * Check if an email is already taken
 * @param excludeId Optional preceptor ID to exclude from check (for updates)
 */
export async function isEmailTaken(
	db: Kysely<DB>,
	email: string,
	excludeId?: string
): Promise<boolean> {
	let query = db
		.selectFrom('preceptors')
		.select('id')
		.where(sql`lower(email)`, '=', email.toLowerCase());

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const preceptor = await query.executeTakeFirst();
	return !!preceptor;
}
