// @ts-nocheck
/**
 * Site Service Unit Tests
 *
 * Comprehensive tests for SiteService business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, Sites, HealthSystems, Clerkships } from '$lib/db/types';
import { SiteService } from './site-service';
import { ConflictError, NotFoundError } from '$lib/api/errors';
import { nanoid } from 'nanoid';

function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = new Kysely<DB>({
		dialect: new SqliteDialect({ database: sqlite })
	});
	return db;
}

async function initializeSchema(db: Kysely<DB>) {
	// Create health_systems table
	await db.schema
		.createTable('health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('location', 'text')
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create sites table
	await db.schema
		.createTable('sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text', (col) => col.references('health_systems.id'))
		.addColumn('address', 'text')
		.addColumn('office_phone', 'text')
		.addColumn('contact_person', 'text')
		.addColumn('contact_email', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create clerkships table
	await db.schema
		.createTable('clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('required_days', 'integer', (col) => col.notNull())
		.addColumn('clerkship_type', 'text', (col) => col.notNull())
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create clerkship_sites table
	await db.schema
		.createTable('clerkship_sites')
		.addColumn('clerkship_id', 'text', (col) => col.notNull().references('clerkships.id'))
		.addColumn('site_id', 'text', (col) => col.notNull().references('sites.id'))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addPrimaryKeyConstraint('clerkship_sites_pk', ['clerkship_id', 'site_id'])
		.execute();

	// Create preceptors table
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create site_electives table
	await db.schema
		.createTable('site_electives')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('site_id', 'text', (col) => col.notNull().references('sites.id'))
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.execute();

	// Create preceptor_sites junction table (for multi-site support)
	await db.schema
		.createTable('preceptor_sites')
		.addColumn('preceptor_id', 'text', (col) => col.notNull().references('preceptors.id'))
		.addColumn('site_id', 'text', (col) => col.notNull().references('sites.id'))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addPrimaryKeyConstraint('preceptor_sites_pk', ['preceptor_id', 'site_id'])
		.execute();
}

async function createHealthSystemDirect(
	db: Kysely<DB>,
	data: Partial<HealthSystems> = {}
): Promise<HealthSystems> {
	const timestamp = new Date().toISOString();
	const healthSystem: HealthSystems = {
		id: nanoid(),
		name: 'Test Health System',
		location: null,
		description: null,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db
		.insertInto('health_systems')
		.values(healthSystem)
		.returningAll()
		.executeTakeFirstOrThrow();
}

async function createSiteDirect(db: Kysely<DB>, data: Partial<Sites> = {}): Promise<Sites> {
	// Create health system if not provided
	if (!data.health_system_id) {
		const healthSystem = await createHealthSystemDirect(db);
		data.health_system_id = healthSystem.id;
	}

	const timestamp = new Date().toISOString();
	const site: Sites = {
		id: nanoid(),
		name: 'Test Site',
		health_system_id: data.health_system_id!,
		address: null,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db.insertInto('sites').values(site).returningAll().executeTakeFirstOrThrow();
}

async function createClerkshipDirect(
	db: Kysely<DB>,
	data: Partial<Clerkships> = {}
): Promise<Clerkships> {
	const timestamp = new Date().toISOString();
	const clerkship: Clerkships = {
		id: nanoid(),
		name: 'Family Medicine',
		specialty: 'Family Medicine',
		required_days: 5,
		clerkship_type: 'inpatient',
		description: null,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db
		.insertInto('clerkships')
		.values(clerkship)
		.returningAll()
		.executeTakeFirstOrThrow();
}

describe('SiteService', () => {
	let db: Kysely<DB>;
	let siteService: SiteService;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
		siteService = new SiteService(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getAllSites()', () => {
		it('returns empty array when no sites exist', async () => {
			const sites = await siteService.getAllSites();
			expect(sites).toEqual([]);
		});

		it('returns all sites ordered by name', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			await createSiteDirect(db, { name: 'Zebra Hospital', health_system_id: healthSystem.id });
			await createSiteDirect(db, { name: 'Alpha Clinic', health_system_id: healthSystem.id });
			await createSiteDirect(db, { name: 'Beta Medical Center', health_system_id: healthSystem.id });

			const sites = await siteService.getAllSites();
			expect(sites).toHaveLength(3);
			expect(sites[0].name).toBe('Alpha Clinic');
			expect(sites[1].name).toBe('Beta Medical Center');
			expect(sites[2].name).toBe('Zebra Hospital');
		});
	});

	describe('getSitesByHealthSystem()', () => {
		it('returns sites filtered by health system', async () => {
			const hs1 = await createHealthSystemDirect(db, { name: 'Health System 1' });
			const hs2 = await createHealthSystemDirect(db, { name: 'Health System 2' });

			await createSiteDirect(db, { name: 'Site A', health_system_id: hs1.id });
			await createSiteDirect(db, { name: 'Site B', health_system_id: hs1.id });
			await createSiteDirect(db, { name: 'Site C', health_system_id: hs2.id });

			const sites = await siteService.getSitesByHealthSystem(hs1.id);
			expect(sites).toHaveLength(2);
			expect(sites.every((site) => site.health_system_id === hs1.id)).toBe(true);
		});

		it('returns empty array when health system has no sites', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			const sites = await siteService.getSitesByHealthSystem(healthSystem.id);
			expect(sites).toEqual([]);
		});

		it('returns sites ordered by name', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			await createSiteDirect(db, { name: 'Zebra Site', health_system_id: healthSystem.id });
			await createSiteDirect(db, { name: 'Alpha Site', health_system_id: healthSystem.id });

			const sites = await siteService.getSitesByHealthSystem(healthSystem.id);
			expect(sites[0].name).toBe('Alpha Site');
			expect(sites[1].name).toBe('Zebra Site');
		});
	});

	describe('getSiteById()', () => {
		it('returns site when found', async () => {
			const created = await createSiteDirect(db);
			const found = await siteService.getSiteById(created.id);

			expect(found.id).toBe(created.id);
			expect(found.name).toBe(created.name);
			expect(found.health_system_id).toBe(created.health_system_id);
		});

		it('throws NotFoundError when site does not exist', async () => {
			await expect(siteService.getSiteById('nonexistent-id')).rejects.toThrow(NotFoundError);
		});

		it('includes all site fields', async () => {
			const created = await createSiteDirect(db, {
				name: 'Complete Site',
				address: '123 Main St'
			});

			const found = await siteService.getSiteById(created.id);
			expect(found.name).toBe('Complete Site');
			expect(found.address).toBe('123 Main St');
			expect(found.created_at).toBeDefined();
			expect(found.updated_at).toBeDefined();
		});
	});

	describe('getSiteByName()', () => {
		it('returns site when found (case-insensitive)', async () => {
			await createSiteDirect(db, { name: 'Test Hospital' });
			const found = await siteService.getSiteByName('test hospital');

			expect(found).not.toBeNull();
			expect(found?.name).toBe('Test Hospital');
		});

		it('returns null when site not found', async () => {
			const found = await siteService.getSiteByName('Nonexistent Site');
			expect(found).toBeNull();
		});

		it('performs case-insensitive search', async () => {
			await createSiteDirect(db, { name: 'MixedCase Hospital' });

			const lower = await siteService.getSiteByName('mixedcase hospital');
			const upper = await siteService.getSiteByName('MIXEDCASE HOSPITAL');
			const mixed = await siteService.getSiteByName('MiXeDcAsE hOsPiTaL');

			expect(lower).not.toBeNull();
			expect(upper).not.toBeNull();
			expect(mixed).not.toBeNull();
		});
	});

	describe('createSite()', () => {
		it('creates a site with valid data', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			const input = {
				name: 'New Hospital',
				health_system_id: healthSystem.id,
				address: '456 Oak Ave'
			};

			const site = await siteService.createSite(input);

			expect(site.id).toBeDefined();
			expect(site.name).toBe(input.name);
			expect(site.health_system_id).toBe(input.health_system_id);
			expect(site.address).toBe(input.address);
			expect(site.created_at).toBeDefined();
			expect(site.updated_at).toBeDefined();
		});

		it('creates a site without optional address', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			const input = {
				name: 'Minimal Site',
				health_system_id: healthSystem.id
			};

			const site = await siteService.createSite(input);
			expect(site.address).toBeNull();
		});

		it('throws ConflictError when name already exists (case-insensitive)', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			await createSiteDirect(db, { name: 'Duplicate Site', health_system_id: healthSystem.id });

			await expect(
				siteService.createSite({
					name: 'duplicate site',
					health_system_id: healthSystem.id
				})
			).rejects.toThrow(ConflictError);
		});

		it('throws NotFoundError when health system does not exist', async () => {
			await expect(
				siteService.createSite({
					name: 'Orphan Site',
					health_system_id: 'nonexistent-id'
				})
			).rejects.toThrow(NotFoundError);
		});

		it('sets timestamps on creation', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			const site = await siteService.createSite({
				name: 'Timestamped Site',
				health_system_id: healthSystem.id
			});

			expect(site.created_at).toBeDefined();
			expect(site.updated_at).toBeDefined();
			expect(site.created_at).toBe(site.updated_at);
		});
	});

	describe('updateSite()', () => {
		it('updates site name', async () => {
			const site = await createSiteDirect(db, { name: 'Old Name' });
			const updated = await siteService.updateSite(site.id, { name: 'New Name' });

			expect(updated.name).toBe('New Name');
		});

		it('updates site address', async () => {
			const site = await createSiteDirect(db, { address: '123 Old St' });
			const updated = await siteService.updateSite(site.id, { address: '456 New Ave' });

			expect(updated.address).toBe('456 New Ave');
		});

		it('updates health system', async () => {
			const hs1 = await createHealthSystemDirect(db, { name: 'HS 1' });
			const hs2 = await createHealthSystemDirect(db, { name: 'HS 2' });
			const site = await createSiteDirect(db, { health_system_id: hs1.id });

			const updated = await siteService.updateSite(site.id, { health_system_id: hs2.id });
			expect(updated.health_system_id).toBe(hs2.id);
		});

		it('updates multiple fields at once', async () => {
			const site = await createSiteDirect(db);
			const hs = await createHealthSystemDirect(db, { name: 'New HS' });

			const updated = await siteService.updateSite(site.id, {
				name: 'Updated Name',
				address: 'Updated Address',
				health_system_id: hs.id
			});

			expect(updated.name).toBe('Updated Name');
			expect(updated.address).toBe('Updated Address');
			expect(updated.health_system_id).toBe(hs.id);
		});

		it('updates updated_at timestamp', async () => {
			const site = await createSiteDirect(db);
			const originalUpdatedAt = site.updated_at;

			// Wait a bit to ensure timestamp changes
			await new Promise((resolve) => setTimeout(resolve, 10));

			const updated = await siteService.updateSite(site.id, { name: 'Updated' });
			expect(updated.updated_at).not.toBe(originalUpdatedAt);
		});

		it('throws NotFoundError when site does not exist', async () => {
			await expect(siteService.updateSite('nonexistent-id', { name: 'Updated' })).rejects.toThrow(
				NotFoundError
			);
		});

		it('throws ConflictError when updating to existing name', async () => {
			const healthSystem = await createHealthSystemDirect(db);
			await createSiteDirect(db, { name: 'Existing Site', health_system_id: healthSystem.id });
			const site2 = await createSiteDirect(db, {
				name: 'Another Site',
				health_system_id: healthSystem.id
			});

			await expect(
				siteService.updateSite(site2.id, { name: 'existing site' })
			).rejects.toThrow(ConflictError);
		});

		it('allows updating site with its own name', async () => {
			const site = await createSiteDirect(db, { name: 'Same Name' });
			const updated = await siteService.updateSite(site.id, { name: 'Same Name' });

			expect(updated.name).toBe('Same Name');
		});

		it('throws NotFoundError when health system does not exist', async () => {
			const site = await createSiteDirect(db);

			await expect(
				siteService.updateSite(site.id, { health_system_id: 'nonexistent-hs-id' })
			).rejects.toThrow(NotFoundError);
		});
	});

	describe('deleteSite()', () => {
		it('deletes an existing site', async () => {
			const site = await createSiteDirect(db);
			await siteService.deleteSite(site.id);

			await expect(siteService.getSiteById(site.id)).rejects.toThrow(NotFoundError);
		});

		it('throws NotFoundError when site does not exist', async () => {
			await expect(siteService.deleteSite('nonexistent-id')).rejects.toThrow(NotFoundError);
		});

		it('throws ConflictError when site has clerkship associations', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: clerkship.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			await expect(siteService.deleteSite(site.id)).rejects.toThrow(ConflictError);
		});

		it('throws ConflictError when site has preceptor associations', async () => {
			const site = await createSiteDirect(db);

			const preceptor = await db
				.insertInto('preceptors')
				.values({
					id: nanoid(),
					name: 'Dr. Test',
					email: 'test@example.com',
					specialty: 'Family Medicine',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.returningAll()
				.executeTakeFirstOrThrow();

			await db
				.insertInto('preceptor_sites')
				.values({
					preceptor_id: preceptor.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			await expect(siteService.deleteSite(site.id)).rejects.toThrow(ConflictError);
		});

		it('throws ConflictError when site has electives', async () => {
			const site = await createSiteDirect(db);

			await db
				.insertInto('site_electives')
				.values({
					id: nanoid(),
					site_id: site.id,
					name: 'Test Elective',
					created_at: new Date().toISOString()
				})
				.execute();

			await expect(siteService.deleteSite(site.id)).rejects.toThrow(ConflictError);
		});
	});

	describe('canDeleteSite()', () => {
		it('returns true when site has no associations', async () => {
			const site = await createSiteDirect(db);
			const canDelete = await siteService.canDeleteSite(site.id);
			expect(canDelete).toBe(true);
		});

		it('returns false when site has clerkship associations', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: clerkship.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			const canDelete = await siteService.canDeleteSite(site.id);
			expect(canDelete).toBe(false);
		});

		it('returns false when site has preceptor associations', async () => {
			const site = await createSiteDirect(db);

			const preceptor = await db
				.insertInto('preceptors')
				.values({
					id: nanoid(),
					name: 'Dr. Test',
					email: 'test2@example.com',
					specialty: 'Family Medicine',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.returningAll()
				.executeTakeFirstOrThrow();

			await db
				.insertInto('preceptor_sites')
				.values({
					preceptor_id: preceptor.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			const canDelete = await siteService.canDeleteSite(site.id);
			expect(canDelete).toBe(false);
		});

		it('returns false when site has electives', async () => {
			const site = await createSiteDirect(db);

			await db
				.insertInto('site_electives')
				.values({
					id: nanoid(),
					site_id: site.id,
					name: 'Test Elective',
					created_at: new Date().toISOString()
				})
				.execute();

			const canDelete = await siteService.canDeleteSite(site.id);
			expect(canDelete).toBe(false);
		});
	});

	describe('siteExists()', () => {
		it('returns true when site exists', async () => {
			const site = await createSiteDirect(db);
			const exists = await siteService.siteExists(site.id);
			expect(exists).toBe(true);
		});

		it('returns false when site does not exist', async () => {
			const exists = await siteService.siteExists('nonexistent-id');
			expect(exists).toBe(false);
		});
	});

	describe('isNameTaken()', () => {
		it('returns true when name is taken (case-insensitive)', async () => {
			await createSiteDirect(db, { name: 'Taken Name' });
			const taken = await siteService.isNameTaken('taken name');
			expect(taken).toBe(true);
		});

		it('returns false when name is not taken', async () => {
			const taken = await siteService.isNameTaken('Available Name');
			expect(taken).toBe(false);
		});

		it('excludes specified site ID', async () => {
			const site = await createSiteDirect(db, { name: 'My Site' });
			const taken = await siteService.isNameTaken('my site', site.id);
			expect(taken).toBe(false);
		});

		it('returns true for name taken by another site when excluding one', async () => {
			const site1 = await createSiteDirect(db, { name: 'Site 1' });
			await createSiteDirect(db, { name: 'Site 2' });

			const taken = await siteService.isNameTaken('site 2', site1.id);
			expect(taken).toBe(true);
		});
	});

	describe('getClerkshipsBySite()', () => {
		it('returns clerkships offered at a site', async () => {
			const site = await createSiteDirect(db);
			const clerkship1 = await createClerkshipDirect(db, { name: 'FM' });
			const clerkship2 = await createClerkshipDirect(db, { name: 'IM' });

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: clerkship1.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: clerkship2.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			const clerkships = await siteService.getClerkshipsBySite(site.id);
			expect(clerkships).toHaveLength(2);
		});

		it('returns empty array when site has no clerkships', async () => {
			const site = await createSiteDirect(db);
			const clerkships = await siteService.getClerkshipsBySite(site.id);
			expect(clerkships).toEqual([]);
		});

		it('returns clerkships ordered by name', async () => {
			const site = await createSiteDirect(db);
			const c1 = await createClerkshipDirect(db, { name: 'Z Clerkship' });
			const c2 = await createClerkshipDirect(db, { name: 'A Clerkship' });

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: c1.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			await db
				.insertInto('clerkship_sites')
				.values({
					clerkship_id: c2.id,
					site_id: site.id,
					created_at: new Date().toISOString()
				})
				.execute();

			const clerkships = await siteService.getClerkshipsBySite(site.id);
			expect(clerkships[0].name).toBe('A Clerkship');
			expect(clerkships[1].name).toBe('Z Clerkship');
		});
	});

	describe('addClerkshipToSite()', () => {
		it('creates a new clerkship-site association', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			const association = await siteService.addClerkshipToSite(site.id, clerkship.id);

			expect(association.site_id).toBe(site.id);
			expect(association.clerkship_id).toBe(clerkship.id);
			expect(association.created_at).toBeDefined();
		});

		it('returns existing association if already exists', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			const first = await siteService.addClerkshipToSite(site.id, clerkship.id);
			const second = await siteService.addClerkshipToSite(site.id, clerkship.id);

			expect(first.site_id).toBe(second.site_id);
			expect(first.clerkship_id).toBe(second.clerkship_id);
			expect(first.created_at).toBe(second.created_at);
		});
	});

	describe('removeClerkshipFromSite()', () => {
		it('removes an existing association', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			await siteService.addClerkshipToSite(site.id, clerkship.id);
			await siteService.removeClerkshipFromSite(site.id, clerkship.id);

			const clerkships = await siteService.getClerkshipsBySite(site.id);
			expect(clerkships).toHaveLength(0);
		});

		it('does not throw error when association does not exist', async () => {
			const site = await createSiteDirect(db);
			const clerkship = await createClerkshipDirect(db);

			await expect(
				siteService.removeClerkshipFromSite(site.id, clerkship.id)
			).resolves.not.toThrow();
		});
	});

	describe('getSitesByClerkship()', () => {
		it('returns sites offering a specific clerkship', async () => {
			const clerkship = await createClerkshipDirect(db);
			const site1 = await createSiteDirect(db, { name: 'Site 1' });
			const site2 = await createSiteDirect(db, { name: 'Site 2' });

			await siteService.addClerkshipToSite(site1.id, clerkship.id);
			await siteService.addClerkshipToSite(site2.id, clerkship.id);

			const sites = await siteService.getSitesByClerkship(clerkship.id);
			expect(sites).toHaveLength(2);
		});

		it('returns empty array when no sites offer clerkship', async () => {
			const clerkship = await createClerkshipDirect(db);
			const sites = await siteService.getSitesByClerkship(clerkship.id);
			expect(sites).toEqual([]);
		});

		it('returns sites ordered by name', async () => {
			const clerkship = await createClerkshipDirect(db);
			const site1 = await createSiteDirect(db, { name: 'Zebra Site' });
			const site2 = await createSiteDirect(db, { name: 'Alpha Site' });

			await siteService.addClerkshipToSite(site1.id, clerkship.id);
			await siteService.addClerkshipToSite(site2.id, clerkship.id);

			const sites = await siteService.getSitesByClerkship(clerkship.id);
			expect(sites[0].name).toBe('Alpha Site');
			expect(sites[1].name).toBe('Zebra Site');
		});
	});
});
