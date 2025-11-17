// @ts-nocheck
/**
 * Blackout Date Service Unit Tests
 *
 * Tests for blackout date business logic and database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB, BlackoutDates } from '$lib/db/types';
import {
	getBlackoutDates,
	getBlackoutDateById,
	getBlackoutDatesByRange,
	createBlackoutDate,
	deleteBlackoutDate,
	isDateBlackedOut,
	blackoutDateExists
} from './blackout-date-service';
import { NotFoundError } from '$lib/api/errors';

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
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();
}

function createMockBlackoutDateData(
	overrides: Partial<Omit<BlackoutDates, 'id' | 'created_at' | 'updated_at'>> = {}
): Omit<BlackoutDates, 'id' | 'created_at' | 'updated_at'> {
	return {
		date: '2024-12-25',
		reason: null,
		...overrides
	};
}

async function createBlackoutDateDirect(
	db: Kysely<DB>,
	data: Partial<BlackoutDates> = {}
): Promise<BlackoutDates> {
	const timestamp = new Date().toISOString();
	const blackoutDate: BlackoutDates = {
		id: crypto.randomUUID(),
		date: '2024-12-25',
		reason: null,
		created_at: timestamp,
		updated_at: timestamp,
		...data
	};

	return await db
		.insertInto('blackout_dates')
		.values(blackoutDate)
		.returningAll()
		.executeTakeFirstOrThrow();
}

describe('Blackout Date Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('getBlackoutDates()', () => {
		it('returns empty array when no blackout dates exist', async () => {
			const dates = await getBlackoutDates(db);
			expect(dates).toEqual([]);
		});

		it('returns all blackout dates', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });
			await createBlackoutDateDirect(db, { date: '2024-01-01' });

			const dates = await getBlackoutDates(db);
			expect(dates).toHaveLength(2);
		});

		it('returns blackout dates ordered by date ascending', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });
			await createBlackoutDateDirect(db, { date: '2024-01-01' });
			await createBlackoutDateDirect(db, { date: '2024-07-04' });

			const dates = await getBlackoutDates(db);
			expect(dates[0].date).toBe('2024-01-01');
			expect(dates[1].date).toBe('2024-07-04');
			expect(dates[2].date).toBe('2024-12-25');
		});

		it('includes reason field', async () => {
			await createBlackoutDateDirect(db, {
				date: '2024-12-25',
				reason: 'Christmas'
			});

			const dates = await getBlackoutDates(db);
			expect(dates[0].reason).toBe('Christmas');
		});
	});

	describe('getBlackoutDateById()', () => {
		it('returns blackout date when found', async () => {
			const created = await createBlackoutDateDirect(db);

			const found = await getBlackoutDateById(db, created.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.date).toBe(created.date);
		});

		it('returns null when blackout date not found', async () => {
			const found = await getBlackoutDateById(db, 'nonexistent-id');
			expect(found).toBeNull();
		});

		it('returns complete blackout date data', async () => {
			const created = await createBlackoutDateDirect(db, {
				date: '2024-12-25',
				reason: 'Holiday'
			});

			const found = await getBlackoutDateById(db, created.id);
			expect(found?.date).toBe('2024-12-25');
			expect(found?.reason).toBe('Holiday');
			expect(found?.created_at).toBeDefined();
		});
	});

	describe('getBlackoutDatesByRange()', () => {
		beforeEach(async () => {
			await createBlackoutDateDirect(db, { date: '2024-01-01' });
			await createBlackoutDateDirect(db, { date: '2024-06-15' });
			await createBlackoutDateDirect(db, { date: '2024-12-25' });
		});

		it('returns all dates when no range specified', async () => {
			const dates = await getBlackoutDatesByRange(db);
			expect(dates).toHaveLength(3);
		});

		it('filters by start_date only', async () => {
			const dates = await getBlackoutDatesByRange(db, '2024-06-01');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-06-15', '2024-12-25']);
		});

		it('filters by end_date only', async () => {
			const dates = await getBlackoutDatesByRange(db, undefined, '2024-06-30');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-01-01', '2024-06-15']);
		});

		it('filters by both start_date and end_date', async () => {
			const dates = await getBlackoutDatesByRange(db, '2024-01-01', '2024-06-30');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-01-01', '2024-06-15']);
		});

		it('includes boundary dates', async () => {
			const dates = await getBlackoutDatesByRange(db, '2024-01-01', '2024-12-25');
			expect(dates).toHaveLength(3);
		});

		it('returns empty array when no dates in range', async () => {
			const dates = await getBlackoutDatesByRange(db, '2024-02-01', '2024-05-31');
			expect(dates).toEqual([]);
		});

		it('returns dates ordered by date ascending', async () => {
			await createBlackoutDateDirect(db, { date: '2024-03-15' });
			await createBlackoutDateDirect(db, { date: '2024-02-14' });

			const dates = await getBlackoutDatesByRange(db, '2024-02-01', '2024-03-31');
			expect(dates[0].date).toBe('2024-02-14');
			expect(dates[1].date).toBe('2024-03-15');
		});
	});

	describe('createBlackoutDate()', () => {
		it('creates a new blackout date', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25'
			});

			const created = await createBlackoutDate(db, data);

			expect(created.id).toBeDefined();
			expect(created.date).toBe('2024-12-25');
			expect(created.created_at).toBeDefined();
		});

		it('creates blackout date with reason', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25',
				reason: 'Christmas'
			});

			const created = await createBlackoutDate(db, data);

			expect(created.reason).toBe('Christmas');
		});

		it('creates blackout date without reason', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25'
			});

			const created = await createBlackoutDate(db, data);

			expect(created.reason).toBeNull();
		});

		it('allows duplicate dates', async () => {
			// Multiple blackout entries for same date are allowed
			// (e.g., different reasons or systems)
			const data = createMockBlackoutDateData({ date: '2024-12-25' });

			const first = await createBlackoutDate(db, data);
			const second = await createBlackoutDate(db, data);

			expect(first.id).not.toBe(second.id);
			expect(first.date).toBe(second.date);
		});

		it('sets created_at timestamp', async () => {
			const before = new Date();
			const data = createMockBlackoutDateData();

			const created = await createBlackoutDate(db, data);
			const after = new Date();

			const createdAt = new Date(created.created_at);
			expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
		});
	});

	describe('deleteBlackoutDate()', () => {
		it('deletes a blackout date', async () => {
			const blackoutDate = await createBlackoutDateDirect(db);

			await deleteBlackoutDate(db, blackoutDate.id);

			const found = await getBlackoutDateById(db, blackoutDate.id);
			expect(found).toBeNull();
		});

		it('throws NotFoundError when blackout date does not exist', async () => {
			await expect(deleteBlackoutDate(db, 'nonexistent-id')).rejects.toThrow(NotFoundError);
		});

		it('only deletes specified blackout date', async () => {
			const blackoutDate1 = await createBlackoutDateDirect(db, { date: '2024-01-01' });
			const blackoutDate2 = await createBlackoutDateDirect(db, { date: '2024-12-25' });

			await deleteBlackoutDate(db, blackoutDate1.id);

			const found1 = await getBlackoutDateById(db, blackoutDate1.id);
			const found2 = await getBlackoutDateById(db, blackoutDate2.id);

			expect(found1).toBeNull();
			expect(found2).not.toBeNull();
		});
	});

	describe('isDateBlackedOut()', () => {
		it('returns true when date is blacked out', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });

			const result = await isDateBlackedOut(db, '2024-12-25');

			expect(result).toBe(true);
		});

		it('returns false when date is not blacked out', async () => {
			const result = await isDateBlackedOut(db, '2024-12-25');

			expect(result).toBe(false);
		});

		it('is case-sensitive for date format', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });

			const result = await isDateBlackedOut(db, '2024-12-25');

			expect(result).toBe(true);
		});

		it('returns true when multiple entries exist for same date', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25', reason: 'Christmas' });
			await createBlackoutDateDirect(db, { date: '2024-12-25', reason: 'Holiday' });

			const result = await isDateBlackedOut(db, '2024-12-25');

			expect(result).toBe(true);
		});

		it('handles different dates correctly', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });

			const christmasResult = await isDateBlackedOut(db, '2024-12-25');
			const newYearResult = await isDateBlackedOut(db, '2024-01-01');

			expect(christmasResult).toBe(true);
			expect(newYearResult).toBe(false);
		});
	});

	describe('blackoutDateExists()', () => {
		it('returns true when blackout date exists', async () => {
			const blackoutDate = await createBlackoutDateDirect(db);

			const exists = await blackoutDateExists(db, blackoutDate.id);

			expect(exists).toBe(true);
		});

		it('returns false when blackout date does not exist', async () => {
			const exists = await blackoutDateExists(db, 'nonexistent-id');

			expect(exists).toBe(false);
		});

		it('checks by ID not by date', async () => {
			const blackoutDate = await createBlackoutDateDirect(db, { date: '2024-12-25' });

			// Should return false for wrong ID even if date exists
			const exists = await blackoutDateExists(db, 'different-id');

			expect(exists).toBe(false);
		});
	});
});
