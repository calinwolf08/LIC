import { db as defaultDb } from '$lib/db';
import { ConflictError, NotFoundError } from '$lib/api/errors';
import type { CreateSiteInput, UpdateSiteInput } from '../schemas';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:sites');

/**
 * Site Service
 *
 * Business logic for managing clinical sites
 */
export class SiteService {
	private db: Kysely<DB>;

	constructor(db?: Kysely<DB>) {
		this.db = db || defaultDb;
	}

	/**
	 * Get all sites
	 */
	async getAllSites() {
		return await this.db
			.selectFrom('sites')
			.selectAll()
			.orderBy('name', 'asc')
			.execute();
	}

	/**
	 * Get sites by health system
	 */
	async getSitesByHealthSystem(healthSystemId: string) {
		return await this.db
			.selectFrom('sites')
			.selectAll()
			.where('health_system_id', '=', healthSystemId)
			.orderBy('name', 'asc')
			.execute();
	}

	/**
	 * Get a single site by ID
	 */
	async getSiteById(id: string) {
		const site = await this.db
			.selectFrom('sites')
			.selectAll()
			.where('id', '=', id)
			.executeTakeFirst();

		if (!site) {
			throw new NotFoundError(`Site with ID ${id} not found`);
		}

		return site;
	}

	/**
	 * Get a site by name (case-insensitive)
	 */
	async getSiteByName(name: string) {
		const site = await this.db
			.selectFrom('sites')
			.selectAll()
			.where(this.db.fn('lower', ['name']), '=', name.toLowerCase())
			.executeTakeFirst();

		return site || null;
	}

	/**
	 * Create a new site
	 */
	async createSite(input: CreateSiteInput) {
		log.debug('Creating site', {
			name: input.name,
			healthSystemId: input.health_system_id
		});

		// Check if name already exists
		const existing = await this.getSiteByName(input.name);
		if (existing) {
			log.warn('Site creation failed - name already exists', { name: input.name });
			throw new ConflictError(`Site with name "${input.name}" already exists`);
		}

		// Verify health system exists (only if provided)
		if (input.health_system_id) {
			const healthSystem = await this.db
				.selectFrom('health_systems')
				.select('id')
				.where('id', '=', input.health_system_id)
				.executeTakeFirst();

			if (!healthSystem) {
				log.warn('Health system not found for site creation', { healthSystemId: input.health_system_id });
				throw new NotFoundError(`Health system with ID ${input.health_system_id} not found`);
			}
		}

		const id = nanoid();
		const now = new Date().toISOString();

		const site = await this.db
			.insertInto('sites')
			.values({
				id,
				name: input.name,
				// Note: DB schema requires health_system_id but app allows optional - this may fail at DB level
				health_system_id: (input.health_system_id || '') as string,
				address: input.address || null,
				office_phone: input.office_phone || null,
				contact_person: input.contact_person || null,
				contact_email: input.contact_email || null,
				created_at: now,
				updated_at: now
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		log.info('Site created', { id: site.id, name: site.name });
		return site;
	}

	/**
	 * Update an existing site
	 */
	async updateSite(id: string, input: UpdateSiteInput) {
		log.debug('Updating site', {
			id,
			updates: Object.keys(input)
		});

		// Check if site exists
		await this.getSiteById(id);

		// If updating name, check for conflicts
		if (input.name) {
			const existing = await this.getSiteByName(input.name);
			if (existing && existing.id !== id) {
				log.warn('Site update failed - name already exists', { id, name: input.name });
				throw new ConflictError(`Site with name "${input.name}" already exists`);
			}
		}

		// If updating health system, verify it exists
		if (input.health_system_id) {
			const healthSystem = await this.db
				.selectFrom('health_systems')
				.select('id')
				.where('id', '=', input.health_system_id)
				.executeTakeFirst();

			if (!healthSystem) {
				log.warn('Health system not found for site update', { id, healthSystemId: input.health_system_id });
				throw new NotFoundError(`Health system with ID ${input.health_system_id} not found`);
			}
		}

		const now = new Date().toISOString();

		// Build update object, converting undefined to null for nullable fields
		const updateData: Record<string, unknown> = {
			updated_at: now
		};

		if (input.name !== undefined) updateData.name = input.name;
		if (input.address !== undefined) updateData.address = input.address || null;
		if (input.office_phone !== undefined) updateData.office_phone = input.office_phone || null;
		if (input.contact_person !== undefined) updateData.contact_person = input.contact_person || null;
		if (input.contact_email !== undefined) updateData.contact_email = input.contact_email || null;
		// Allow clearing health_system_id by setting to null
		if ('health_system_id' in input) updateData.health_system_id = input.health_system_id || null;

		const site = await this.db
			.updateTable('sites')
			.set(updateData)
			.where('id', '=', id)
			.returningAll()
			.executeTakeFirstOrThrow();

		log.info('Site updated', {
			id: site.id,
			name: site.name,
			updatedFields: Object.keys(updateData).filter(k => k !== 'updated_at')
		});

		return site;
	}

	/**
	 * Delete a site
	 */
	async deleteSite(id: string) {
		log.debug('Deleting site', { id });

		// Check if site exists
		await this.getSiteById(id);

		// Check if site is being used
		const canDelete = await this.canDeleteSite(id);
		if (!canDelete) {
			log.warn('Cannot delete site with dependencies', { id });
			throw new ConflictError(
				'Cannot delete site because it is associated with clerkships, preceptors, or has scheduling data'
			);
		}

		await this.db.deleteFrom('sites').where('id', '=', id).execute();

		log.info('Site deleted', { id });
	}

	/**
	 * Get dependency counts for a site
	 * Returns counts of all entities that reference this site
	 */
	async getSiteDependencies(id: string): Promise<{
		clerkships: number;
		electives: number;
		preceptors: number;
		total: number;
	}> {
		// Check clerkship associations
		const clerkshipCount = await this.db
			.selectFrom('clerkship_sites')
			.select(({ fn }) => [fn.count<number>('clerkship_id').as('count')])
			.where('site_id', '=', id)
			.executeTakeFirst();

		// Check site electives
		const electiveCount = await this.db
			.selectFrom('site_electives')
			.select(({ fn }) => [fn.count<number>('site_id').as('count')])
			.where('site_id', '=', id)
			.executeTakeFirst();

		// Check preceptors associated with this site (via junction table)
		const preceptorCount = await this.db
			.selectFrom('preceptor_sites')
			.select(({ fn }) => [fn.count<number>('preceptor_id').as('count')])
			.where('site_id', '=', id)
			.executeTakeFirst();

		const clerkships = clerkshipCount?.count ?? 0;
		const electives = electiveCount?.count ?? 0;
		const preceptors = preceptorCount?.count ?? 0;

		return {
			clerkships,
			electives,
			preceptors,
			total: clerkships + electives + preceptors
		};
	}

	/**
	 * Check if a site can be deleted
	 */
	async canDeleteSite(id: string): Promise<boolean> {
		const deps = await this.getSiteDependencies(id);
		return deps.total === 0;
	}

	/**
	 * Check if a site exists
	 */
	async siteExists(id: string): Promise<boolean> {
		const site = await this.db
			.selectFrom('sites')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();

		return !!site;
	}

	/**
	 * Check if a site name is taken
	 */
	async isNameTaken(name: string, excludeId?: string): Promise<boolean> {
		let query = this.db
			.selectFrom('sites')
			.select('id')
			.where(this.db.fn('lower', ['name']), '=', name.toLowerCase());

		if (excludeId) {
			query = query.where('id', '!=', excludeId);
		}

		const site = await query.executeTakeFirst();
		return !!site;
	}

	/**
	 * Get clerkships offered at a site
	 */
	async getClerkshipsBySite(siteId: string) {
		return await this.db
			.selectFrom('clerkship_sites')
			.innerJoin('clerkships', 'clerkships.id', 'clerkship_sites.clerkship_id')
			.selectAll('clerkships')
			.where('clerkship_sites.site_id', '=', siteId)
			.orderBy('clerkships.name', 'asc')
			.execute();
	}

	/**
	 * Add a clerkship-site association
	 */
	async addClerkshipToSite(siteId: string, clerkshipId: string) {
		// Check if association already exists
		const existing = await this.db
			.selectFrom('clerkship_sites')
			.selectAll()
			.where('site_id', '=', siteId)
			.where('clerkship_id', '=', clerkshipId)
			.executeTakeFirst();

		if (existing) {
			return existing; // Already exists, return it
		}

		const now = new Date().toISOString();

		return await this.db
			.insertInto('clerkship_sites')
			.values({
				site_id: siteId,
				clerkship_id: clerkshipId,
				created_at: now
			})
			.returningAll()
			.executeTakeFirstOrThrow();
	}

	/**
	 * Remove a clerkship-site association
	 */
	async removeClerkshipFromSite(siteId: string, clerkshipId: string) {
		await this.db
			.deleteFrom('clerkship_sites')
			.where('site_id', '=', siteId)
			.where('clerkship_id', '=', clerkshipId)
			.execute();
	}

	/**
	 * Get sites offering a specific clerkship
	 */
	async getSitesByClerkship(clerkshipId: string) {
		return await this.db
			.selectFrom('clerkship_sites')
			.innerJoin('sites', 'sites.id', 'clerkship_sites.site_id')
			.selectAll('sites')
			.where('clerkship_sites.clerkship_id', '=', clerkshipId)
			.orderBy('sites.name', 'asc')
			.execute();
	}
}

// Export singleton instance
export const siteService = new SiteService();
