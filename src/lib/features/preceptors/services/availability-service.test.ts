// @ts-nocheck
/**
 * Availability Service Unit Tests
 *
 * Tests for preceptor availability business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, PreceptorAvailability, Preceptors } from '$lib/db/types';
import {
	getAvailability,
	getAvailabilityById,
	getAvailabilityByDateRange,
	getAvailabilityByDate,
	setAvailability,
	deleteAvailability,
	bulkUpdateAvailability,
	canDeleteAvailability
} from './availability-service';
import { NotFoundError, ConflictError } from '$lib/api/errors';

function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	const db = new Kysely<DB>({
		dialect: new SqliteDialect({ database: sqlite })
	});
	return db;
}

async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('health_system_id', 'text')
		.addColumn('phone', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('preceptor_sites')
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

const DEFAULT_SITE_ID = 'test-site-1';

async function createSiteDirect(db: Kysely<DB>, id: string = DEFAULT_SITE_ID): Promise<void> {
	const timestamp = new Date().toISOString();
	await db.insertInto('sites').values({
		id,
		name: 'Test Site',
		health_system_id: null,
		created_at: timestamp,
		updated_at: timestamp
	}).execute();
}

async function createPreceptorDirect(
	db: Kysely<DB>,
	data: Partial<Preceptors> = {}
): Promise<Preceptors> {
	const timestamp = new Date().toISOString();
	const preceptor: Preceptors = {
		id: crypto.randomUUID(),
		name: 'Dr. Test',
		email: 'test@example.com',
		health_system_id: null,
		phone: null,
		max_students: 2,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db.insertInto('preceptors').values(preceptor).returningAll().executeTakeFirstOrThrow();
}

async function createAvailabilityDirect(
	db: Kysely<DB>,
	data: Partial<PreceptorAvailability> = {}
): Promise<PreceptorAvailability> {
	const timestamp = new Date().toISOString();
	const availability: PreceptorAvailability = {
		id: crypto.randomUUID(),
		preceptor_id: 'preceptor-1',
		site_id: DEFAULT_SITE_ID,
		date: '2024-01-15',
		is_available: 1,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db
		.insertInto('preceptor_availability')
		.values(availability)
		.returningAll()
		.executeTakeFirstOrThrow();
}

describe('Availability Service', () => {
	let db: Kysely<DB>;
	let preceptor: Preceptors;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
		await createSiteDirect(db);
		preceptor = await createPreceptorDirect(db, { id: 'preceptor-1' });
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getAvailability()', () => {
		it('returns empty array when no availability exists', async () => {
			const availability = await getAvailability(db, preceptor.id);
			expect(availability).toEqual([]);
		});

		it('returns all availability for preceptor', async () => {
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-16'
			});

			const availability = await getAvailability(db, preceptor.id);
			expect(availability).toHaveLength(2);
		});

		it('returns availability ordered by date ascending', async () => {
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-20'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-18'
			});

			const availability = await getAvailability(db, preceptor.id);
			expect(availability[0].date).toBe('2024-01-15');
			expect(availability[1].date).toBe('2024-01-18');
			expect(availability[2].date).toBe('2024-01-20');
		});

		it('only returns availability for specified preceptor', async () => {
			const preceptor2 = await createPreceptorDirect(db, {
				id: 'preceptor-2',
				email: 'test2@example.com'
			});

			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor2.id,
				date: '2024-01-15'
			});

			const availability = await getAvailability(db, preceptor.id);
			expect(availability).toHaveLength(1);
			expect(availability[0].preceptor_id).toBe(preceptor.id);
		});
	});

	describe('getAvailabilityById()', () => {
		it('returns availability when found', async () => {
			const created = await createAvailabilityDirect(db, { preceptor_id: preceptor.id });

			const found = await getAvailabilityById(db, created.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
		});

		it('returns null when not found', async () => {
			const found = await getAvailabilityById(db, 'nonexistent-id');
			expect(found).toBeNull();
		});

		it('returns complete availability data', async () => {
			const created = await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15',
				is_available: 1
			});

			const found = await getAvailabilityById(db, created.id);
			expect(found?.preceptor_id).toBe(preceptor.id);
			expect(found?.date).toBe('2024-01-15');
			expect(found?.is_available).toBe(1);
		});
	});

	describe('getAvailabilityByDateRange()', () => {
		beforeEach(async () => {
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-10'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-20'
			});
		});

		it('returns availability within date range', async () => {
			const availability = await getAvailabilityByDateRange(db, preceptor.id, {
				start_date: '2024-01-12',
				end_date: '2024-01-18'
			});

			expect(availability).toHaveLength(1);
			expect(availability[0].date).toBe('2024-01-15');
		});

		it('includes boundary dates', async () => {
			const availability = await getAvailabilityByDateRange(db, preceptor.id, {
				start_date: '2024-01-10',
				end_date: '2024-01-20'
			});

			expect(availability).toHaveLength(3);
		});

		it('returns empty array when no dates in range', async () => {
			const availability = await getAvailabilityByDateRange(db, preceptor.id, {
				start_date: '2024-02-01',
				end_date: '2024-02-28'
			});

			expect(availability).toEqual([]);
		});

		it('returns availability ordered by date', async () => {
			const availability = await getAvailabilityByDateRange(db, preceptor.id, {
				start_date: '2024-01-01',
				end_date: '2024-01-31'
			});

			expect(availability[0].date).toBe('2024-01-10');
			expect(availability[1].date).toBe('2024-01-15');
			expect(availability[2].date).toBe('2024-01-20');
		});
	});

	describe('getAvailabilityByDate()', () => {
		it('returns availability for specific date', async () => {
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});

			const found = await getAvailabilityByDate(db, preceptor.id, '2024-01-15');
			expect(found).not.toBeNull();
			expect(found?.date).toBe('2024-01-15');
		});

		it('returns null when no availability on date', async () => {
			const found = await getAvailabilityByDate(db, preceptor.id, '2024-01-15');
			expect(found).toBeNull();
		});

		it('only returns for specified preceptor', async () => {
			const preceptor2 = await createPreceptorDirect(db, {
				id: 'preceptor-2',
				email: 'test2@example.com'
			});

			await createAvailabilityDirect(db, {
				preceptor_id: preceptor2.id,
				date: '2024-01-15'
			});

			const found = await getAvailabilityByDate(db, preceptor.id, '2024-01-15');
			expect(found).toBeNull();
		});
	});

	describe('setAvailability()', () => {
		it('creates new availability record', async () => {
			const created = await setAvailability(db, preceptor.id, DEFAULT_SITE_ID, '2024-01-15', true);

			expect(created.id).toBeDefined();
			expect(created.preceptor_id).toBe(preceptor.id);
			expect(created.site_id).toBe(DEFAULT_SITE_ID);
			expect(created.date).toBe('2024-01-15');
			expect(created.is_available).toBe(1);
		});

		it('creates unavailability record', async () => {
			const created = await setAvailability(db, preceptor.id, DEFAULT_SITE_ID, '2024-01-15', false);

			expect(created.is_available).toBe(0);
		});

		it('updates existing availability record', async () => {
			const existing = await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				date: '2024-01-15',
				is_available: 1
			});

			const updated = await setAvailability(db, preceptor.id, DEFAULT_SITE_ID, '2024-01-15', false);

			expect(updated.id).toBe(existing.id);
			expect(updated.is_available).toBe(0);
		});

		it('throws NotFoundError when preceptor does not exist', async () => {
			await expect(setAvailability(db, 'nonexistent-id', DEFAULT_SITE_ID, '2024-01-15', true)).rejects.toThrow(
				NotFoundError
			);
		});

		it('sets created_at and updated_at for new record', async () => {
			const created = await setAvailability(db, preceptor.id, DEFAULT_SITE_ID, '2024-01-15', true);

			expect(created.created_at).toBeDefined();
			expect(created.updated_at).toBeDefined();
			expect(created.created_at).toBe(created.updated_at);
		});

		it('updates updated_at when updating existing record', async () => {
			const existing = await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				date: '2024-01-15',
				is_available: 1
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const updated = await setAvailability(db, preceptor.id, DEFAULT_SITE_ID, '2024-01-15', false);

			expect(updated.updated_at).not.toBe(existing.updated_at);
			expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
				new Date(existing.updated_at).getTime()
			);
		});
	});

	describe('deleteAvailability()', () => {
		it('deletes availability record', async () => {
			const availability = await createAvailabilityDirect(db, { preceptor_id: preceptor.id });

			await deleteAvailability(db, availability.id);

			const found = await getAvailabilityById(db, availability.id);
			expect(found).toBeNull();
		});

		it('throws NotFoundError when availability does not exist', async () => {
			await expect(deleteAvailability(db, 'nonexistent-id')).rejects.toThrow(NotFoundError);
		});

		it('throws ConflictError when availability has assignments', async () => {
			const availability = await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});

			// Create an assignment on this date
			await db
				.insertInto('schedule_assignments')
				.values({
					id: crypto.randomUUID(),
					student_id: 'student-1',
					preceptor_id: preceptor.id,
					clerkship_id: 'clerkship-1',
					date: '2024-01-15',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			await expect(deleteAvailability(db, availability.id)).rejects.toThrow(ConflictError);
		});
	});

	describe('bulkUpdateAvailability()', () => {
		it('creates multiple availability records', async () => {
			const data = {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				availability: [
					{ date: '2024-01-15', is_available: true },
					{ date: '2024-01-16', is_available: false },
					{ date: '2024-01-17', is_available: true }
				]
			};

			const results = await bulkUpdateAvailability(db, data);

			expect(results).toHaveLength(3);
			expect(results[0].date).toBe('2024-01-15');
			expect(results[0].is_available).toBe(1);
			expect(results[0].site_id).toBe(DEFAULT_SITE_ID);
			expect(results[1].is_available).toBe(0);
			expect(results[2].is_available).toBe(1);
		});

		it('updates existing records and creates new ones', async () => {
			await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				date: '2024-01-15',
				is_available: 0
			});

			const data = {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				availability: [
					{ date: '2024-01-15', is_available: true }, // Update existing
					{ date: '2024-01-16', is_available: true } // Create new
				]
			};

			const results = await bulkUpdateAvailability(db, data);

			expect(results).toHaveLength(2);
			expect(results[0].date).toBe('2024-01-15');
			expect(results[0].is_available).toBe(1);
		});

		it('throws NotFoundError when preceptor does not exist', async () => {
			const data = {
				preceptor_id: 'nonexistent-id',
				site_id: DEFAULT_SITE_ID,
				availability: [{ date: '2024-01-15', is_available: true }]
			};

			await expect(bulkUpdateAvailability(db, data)).rejects.toThrow(NotFoundError);
		});

		it('handles empty availability array', async () => {
			const data = {
				preceptor_id: preceptor.id,
				site_id: DEFAULT_SITE_ID,
				availability: []
			};

			const results = await bulkUpdateAvailability(db, data);

			expect(results).toEqual([]);
		});
	});

	describe('canDeleteAvailability()', () => {
		it('returns true when availability can be deleted', async () => {
			const availability = await createAvailabilityDirect(db, { preceptor_id: preceptor.id });

			const canDelete = await canDeleteAvailability(db, availability.id);

			expect(canDelete).toBe(true);
		});

		it('returns false when availability has assignments', async () => {
			const availability = await createAvailabilityDirect(db, {
				preceptor_id: preceptor.id,
				date: '2024-01-15'
			});

			await db
				.insertInto('schedule_assignments')
				.values({
					id: crypto.randomUUID(),
					student_id: 'student-1',
					preceptor_id: preceptor.id,
					clerkship_id: 'clerkship-1',
					date: '2024-01-15',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute();

			const canDelete = await canDeleteAvailability(db, availability.id);

			expect(canDelete).toBe(false);
		});

		it('returns false when availability does not exist', async () => {
			const canDelete = await canDeleteAvailability(db, 'nonexistent-id');

			expect(canDelete).toBe(false);
		});
	});
});
