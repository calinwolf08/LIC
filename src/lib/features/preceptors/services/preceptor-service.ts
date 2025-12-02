/**
 * Preceptor Service Layer
 *
 * Business logic and database operations for preceptors
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, Preceptors } from '$lib/db/types';
import type { CreatePreceptorInput, UpdatePreceptorInput } from '../schemas.js';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { sql } from 'kysely';

/**
 * Get all preceptors, ordered by name
 */
export async function getPreceptors(db: Kysely<DB>): Promise<Selectable<Preceptors>[]> {
	return await db.selectFrom('preceptors').selectAll().orderBy('name', 'asc').execute();
}

/**
 * Get a single preceptor by ID
 * @returns Preceptor or null if not found
 */
export async function getPreceptorById(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<Preceptors> | null> {
	const preceptor = await db
		.selectFrom('preceptors')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return preceptor || null;
}

/**
 * Get a preceptor by email (case-insensitive)
 * @returns Preceptor or null if not found
 */
export async function getPreceptorByEmail(
	db: Kysely<DB>,
	email: string
): Promise<Selectable<Preceptors> | null> {
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
): Promise<Selectable<Preceptors>> {
	// Check if email is already taken
	const existingPreceptor = await getPreceptorByEmail(db, data.email);
	if (existingPreceptor) {
		throw new ConflictError('Email already exists');
	}

	const timestamp = new Date().toISOString();
	const newPreceptor = {
		id: crypto.randomUUID(),
		name: data.name,
		email: data.email,
		phone: data.phone || null,
		health_system_id: data.health_system_id || null,
		site_id: data.site_id || null,
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
): Promise<Selectable<Preceptors>> {
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

	// Build update object, converting undefined to null for nullable fields
	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	if (data.name !== undefined) updateData.name = data.name;
	if (data.email !== undefined) updateData.email = data.email;
	if (data.max_students !== undefined) updateData.max_students = data.max_students;
	if (data.phone !== undefined) updateData.phone = data.phone || null;
	if ('health_system_id' in data) updateData.health_system_id = data.health_system_id || null;
	if ('site_id' in data) updateData.site_id = data.site_id || null;

	const updated = await db
		.updateTable('preceptors')
		.set(updateData)
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

// ============================================================================
// Multi-Site Management
// ============================================================================

/**
 * Get site IDs for a preceptor
 */
export async function getPreceptorSites(db: Kysely<DB>, preceptorId: string): Promise<string[]> {
	const sites = await db
		.selectFrom('preceptor_sites')
		.select('site_id')
		.where('preceptor_id', '=', preceptorId)
		.execute();
	return sites.map((s) => s.site_id);
}

/**
 * Set sites for a preceptor (replaces all existing)
 */
export async function setPreceptorSites(
	db: Kysely<DB>,
	preceptorId: string,
	siteIds: string[]
): Promise<void> {
	// Delete existing associations
	await db.deleteFrom('preceptor_sites').where('preceptor_id', '=', preceptorId).execute();

	// Add new associations
	if (siteIds.length > 0) {
		await db
			.insertInto('preceptor_sites')
			.values(
				siteIds.map((siteId) => ({
					preceptor_id: preceptorId,
					site_id: siteId
				}))
			)
			.execute();
	}
}

/**
 * Preceptor with all associations (health system, sites, clerkships, teams)
 */
export interface PreceptorWithAssociations {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	max_students: number;
	health_system_id: string | null;
	health_system_name: string | null;
	created_at: string;
	updated_at: string;
	sites: Array<{ id: string; name: string }>;
	clerkships: Array<{ id: string; name: string }>;
	teams: Array<{ id: string; name: string | null }>;
}

/**
 * Get preceptors with their sites, clerkships, and teams
 */
export async function getPreceptorsWithAssociations(
	db: Kysely<DB>
): Promise<PreceptorWithAssociations[]> {
	const preceptors = await db
		.selectFrom('preceptors')
		.leftJoin('health_systems', 'preceptors.health_system_id', 'health_systems.id')
		.select([
			'preceptors.id',
			'preceptors.name',
			'preceptors.email',
			'preceptors.phone',
			'preceptors.max_students',
			'preceptors.health_system_id',
			'health_systems.name as health_system_name',
			'preceptors.created_at',
			'preceptors.updated_at'
		])
		.orderBy('preceptors.name', 'asc')
		.execute();

	// For each preceptor, get their sites, clerkships (via teams), and teams
	const result = await Promise.all(
		preceptors.map(async (p) => {
			// Get sites via preceptor_sites junction table
			const sites = await db
				.selectFrom('preceptor_sites')
				.innerJoin('sites', 'preceptor_sites.site_id', 'sites.id')
				.select(['sites.id', 'sites.name'])
				.where('preceptor_sites.preceptor_id', '=', p.id as string)
				.execute();

			// Get teams and clerkships via preceptor_team_members
			const teams = await db
				.selectFrom('preceptor_team_members')
				.innerJoin('preceptor_teams', 'preceptor_team_members.team_id', 'preceptor_teams.id')
				.innerJoin('clerkships', 'preceptor_teams.clerkship_id', 'clerkships.id')
				.select([
					'preceptor_teams.id as team_id',
					'preceptor_teams.name as team_name',
					'clerkships.id as clerkship_id',
					'clerkships.name as clerkship_name'
				])
				.where('preceptor_team_members.preceptor_id', '=', p.id as string)
				.execute();

			// Extract unique clerkships from teams
			const clerkshipsMap = new Map<string, string>();
			teams.forEach((t) => {
				if (t.clerkship_id) {
					clerkshipsMap.set(t.clerkship_id, t.clerkship_name || 'Unknown');
				}
			});
			const clerkships = Array.from(clerkshipsMap.entries()).map(([id, name]) => ({ id, name }));

			return {
				id: p.id as string,
				name: p.name,
				email: p.email,
				phone: p.phone,
				max_students: p.max_students,
				health_system_id: p.health_system_id,
				health_system_name: p.health_system_name,
				created_at: p.created_at as string,
				updated_at: p.updated_at as string,
				sites: sites.map((s) => ({ id: s.id as string, name: s.name })),
				clerkships,
				teams: teams.map((t) => ({ id: t.team_id as string, name: t.team_name }))
			};
		})
	);

	return result;
}

/**
 * Get preceptors filtered by site IDs
 * Returns preceptors who work at any of the specified sites, or all if no sites specified
 */
export async function getPreceptorsBySites(
	db: Kysely<DB>,
	siteIds: string[]
): Promise<Selectable<Preceptors>[]> {
	if (siteIds.length === 0) {
		return getPreceptors(db);
	}

	// Get preceptors who work at any of the specified sites
	const preceptorIds = await db
		.selectFrom('preceptor_sites')
		.select('preceptor_id')
		.where('site_id', 'in', siteIds)
		.execute();

	const uniqueIds = [...new Set(preceptorIds.map((p) => p.preceptor_id))];

	if (uniqueIds.length === 0) {
		return [];
	}

	return db
		.selectFrom('preceptors')
		.selectAll()
		.where('id', 'in', uniqueIds)
		.orderBy('name', 'asc')
		.execute();
}
