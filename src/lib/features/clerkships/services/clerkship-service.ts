/**
 * Clerkship Service Layer
 *
 * Business logic and database operations for clerkships
 */

import type { Kysely } from 'kysely';
import type { DB, Clerkships } from '$lib/db/types';
import type { CreateClerkshipInput, UpdateClerkshipInput } from '../schemas';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { sql } from 'kysely';

/**
 * Get all clerkships, ordered by name
 */
export async function getClerkships(db: Kysely<DB>): Promise<Clerkships[]> {
	return await db.selectFrom('clerkships').selectAll().orderBy('name', 'asc').execute();
}

/**
 * Get a single clerkship by ID
 * @returns Clerkship or null if not found
 */
export async function getClerkshipById(
	db: Kysely<DB>,
	id: string
): Promise<Clerkships | null> {
	const clerkship = await db
		.selectFrom('clerkships')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return clerkship || null;
}

/**
 * Get all clerkships with a specific specialty
 */
export async function getClerkshipsBySpecialty(
	db: Kysely<DB>,
	specialty: string
): Promise<Clerkships[]> {
	return await db
		.selectFrom('clerkships')
		.selectAll()
		.where('specialty', '=', specialty)
		.orderBy('name', 'asc')
		.execute();
}

/**
 * Get a clerkship by name (case-insensitive)
 * @returns Clerkship or null if not found
 */
export async function getClerkshipByName(
	db: Kysely<DB>,
	name: string
): Promise<Clerkships | null> {
	const clerkship = await db
		.selectFrom('clerkships')
		.selectAll()
		.where(sql`lower(name)`, '=', name.toLowerCase())
		.executeTakeFirst();

	return clerkship || null;
}

/**
 * Create a new clerkship
 * @throws {ConflictError} If name already exists
 */
export async function createClerkship(
	db: Kysely<DB>,
	data: CreateClerkshipInput
): Promise<Clerkships> {
	// Check if name is already taken
	const existingClerkship = await getClerkshipByName(db, data.name);
	if (existingClerkship) {
		throw new ConflictError('Clerkship name already exists');
	}

	const timestamp = new Date().toISOString();
	const newClerkship = {
		id: crypto.randomUUID(),
		name: data.name,
		specialty: data.specialty,
		required_days: data.required_days,
		description: data.description || null,
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('clerkships')
		.values(newClerkship)
		.returningAll()
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * Update an existing clerkship
 * @throws {NotFoundError} If clerkship not found
 * @throws {ConflictError} If new name is already taken
 */
export async function updateClerkship(
	db: Kysely<DB>,
	id: string,
	data: UpdateClerkshipInput
): Promise<Clerkships> {
	// Check if clerkship exists
	const exists = await clerkshipExists(db, id);
	if (!exists) {
		throw new NotFoundError('Clerkship');
	}

	// If name is being updated, check if it's taken by another clerkship
	if (data.name) {
		const nameTaken = await isNameTaken(db, data.name, id);
		if (nameTaken) {
			throw new ConflictError('Clerkship name already exists');
		}
	}

	const updated = await db
		.updateTable('clerkships')
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
 * Delete a clerkship
 * @throws {NotFoundError} If clerkship not found
 * @throws {ConflictError} If clerkship has schedule assignments
 */
export async function deleteClerkship(db: Kysely<DB>, id: string): Promise<void> {
	// Check if clerkship exists
	const exists = await clerkshipExists(db, id);
	if (!exists) {
		throw new NotFoundError('Clerkship');
	}

	// Check if clerkship can be deleted
	const canDelete = await canDeleteClerkship(db, id);
	if (!canDelete) {
		throw new ConflictError('Cannot delete clerkship with existing schedule assignments');
	}

	await db.deleteFrom('clerkships').where('id', '=', id).execute();
}

/**
 * Check if a clerkship can be deleted (has no assignments)
 */
export async function canDeleteClerkship(db: Kysely<DB>, id: string): Promise<boolean> {
	const assignment = await db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('clerkship_id', '=', id)
		.executeTakeFirst();

	return !assignment;
}

/**
 * Check if a clerkship exists
 */
export async function clerkshipExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const clerkship = await getClerkshipById(db, id);
	return clerkship !== null;
}

/**
 * Check if a name is already taken
 * @param excludeId Optional clerkship ID to exclude from check (for updates)
 */
export async function isNameTaken(
	db: Kysely<DB>,
	name: string,
	excludeId?: string
): Promise<boolean> {
	let query = db
		.selectFrom('clerkships')
		.select('id')
		.where(sql`lower(name)`, '=', name.toLowerCase());

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const clerkship = await query.executeTakeFirst();
	return !!clerkship;
}
