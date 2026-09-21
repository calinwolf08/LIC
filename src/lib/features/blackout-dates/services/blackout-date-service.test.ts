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
import { NotFoundError, ConflictError } from '$lib/api/errors';

function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	const db = new Kysely<DB>({
		dialect: new SqliteDialect({ database: sqlite })
	});
	return db;
}

// Blackouts are scoped to a schedule (finding P4-d); these unit tests all
// operate within one schedule.
const SCHEDULE_ID = 'sched-test';

async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text')
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addUniqueConstraint('uq_blackout_schedule_date', ['schedule_id', 'date'])
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
	const blackoutDate = {
		id: crypto.randomUUID(),
		schedule_id: SCHEDULE_ID,
		date: '2024-12-25',
		reason: null,
		created_at: timestamp,
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
			const dates = await getBlackoutDates(db, SCHEDULE_ID);
			expect(dates).toEqual([]);
		});

		it('returns all blackout dates', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });
			await createBlackoutDateDirect(db, { date: '2024-01-01' });

			const dates = await getBlackoutDates(db, SCHEDULE_ID);
			expect(dates).toHaveLength(2);
		});

		it('returns blackout dates ordered by date ascending', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });
			await createBlackoutDateDirect(db, { date: '2024-01-01' });
			await createBlackoutDateDirect(db, { date: '2024-07-04' });

			const dates = await getBlackoutDates(db, SCHEDULE_ID);
			expect(dates[0].date).toBe('2024-01-01');
			expect(dates[1].date).toBe('2024-07-04');
			expect(dates[2].date).toBe('2024-12-25');
		});

		it('includes reason field', async () => {
			await createBlackoutDateDirect(db, {
				date: '2024-12-25',
				reason: 'Christmas'
			});

			const dates = await getBlackoutDates(db, SCHEDULE_ID);
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
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID);
			expect(dates).toHaveLength(3);
		});

		it('filters by start_date only', async () => {
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, '2024-06-01');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-06-15', '2024-12-25']);
		});

		it('filters by end_date only', async () => {
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, undefined, '2024-06-30');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-01-01', '2024-06-15']);
		});

		it('filters by both start_date and end_date', async () => {
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, '2024-01-01', '2024-06-30');
			expect(dates).toHaveLength(2);
			expect(dates.map((d) => d.date)).toEqual(['2024-01-01', '2024-06-15']);
		});

		it('includes boundary dates', async () => {
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, '2024-01-01', '2024-12-25');
			expect(dates).toHaveLength(3);
		});

		it('returns empty array when no dates in range', async () => {
			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, '2024-02-01', '2024-05-31');
			expect(dates).toEqual([]);
		});

		it('returns dates ordered by date ascending', async () => {
			await createBlackoutDateDirect(db, { date: '2024-03-15' });
			await createBlackoutDateDirect(db, { date: '2024-02-14' });

			const dates = await getBlackoutDatesByRange(db, SCHEDULE_ID, '2024-02-01', '2024-03-31');
			expect(dates[0].date).toBe('2024-02-14');
			expect(dates[1].date).toBe('2024-03-15');
		});
	});

	describe('createBlackoutDate()', () => {
		it('creates a new blackout date', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25'
			});

			const created = await createBlackoutDate(db, data, SCHEDULE_ID);

			expect(created.id).toBeDefined();
			expect(created.date).toBe('2024-12-25');
			expect(created.created_at).toBeDefined();
		});

		it('creates blackout date with reason', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25',
				reason: 'Christmas'
			});

			const created = await createBlackoutDate(db, data, SCHEDULE_ID);

			expect(created.reason).toBe('Christmas');
		});

		it('creates blackout date without reason', async () => {
			const data = createMockBlackoutDateData({
				date: '2024-12-25'
			});

			const created = await createBlackoutDate(db, data, SCHEDULE_ID);

			expect(created.reason).toBeNull();
		});

		it('rejects duplicate dates with a friendly ConflictError (P4-e)', async () => {
			// Blackout dates must be unique. The service pre-checks and raises a 409
			// ConflictError (message contains "duplicate") instead of letting a raw
			// SQLITE_CONSTRAINT_UNIQUE surface as a 500.
			const data = createMockBlackoutDateData({ date: '2024-12-25' });

			await createBlackoutDate(db, data, SCHEDULE_ID);

			await expect(createBlackoutDate(db, data, SCHEDULE_ID)).rejects.toThrow(ConflictError);
			await expect(createBlackoutDate(db, data, SCHEDULE_ID)).rejects.toThrow(/duplicate/i);
		});

		it('sets created_at timestamp', async () => {
			const before = new Date();
			const data = createMockBlackoutDateData();

			const created = await createBlackoutDate(db, data, SCHEDULE_ID);
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

		it('handles different dates correctly', async () => {
			await createBlackoutDateDirect(db, { date: '2024-12-25' });

			const christmasResult = await isDateBlackedOut(db, '2024-12-25');
			const newYearResult = await isDateBlackedOut(db, '2024-01-01');

			expect(christmasResult).toBe(true);
			expect(newYearResult).toBe(false);
		});
	});

	// Blackouts are per-schedule (finding P4-d): reads and deletes must never
	// cross the schedule boundary, and the same date may exist in two schedules.
	describe('schedule scoping (P4-d)', () => {
		const OTHER = 'sched-other';

		it('getBlackoutDates only returns the given schedule', async () => {
			await createBlackoutDateDirect(db, { schedule_id: SCHEDULE_ID, date: '2024-12-25' });
			await createBlackoutDateDirect(db, { schedule_id: OTHER, date: '2024-01-01' });

			const mine = await getBlackoutDates(db, SCHEDULE_ID);
			expect(mine).toHaveLength(1);
			expect(mine[0].date).toBe('2024-12-25');

			const theirs = await getBlackoutDates(db, OTHER);
			expect(theirs).toHaveLength(1);
			expect(theirs[0].date).toBe('2024-01-01');
		});

		it('allows the same date in two different schedules', async () => {
			await createBlackoutDate(db, createMockBlackoutDateData({ date: '2024-07-04' }), SCHEDULE_ID);
			// Same date, different schedule — must not collide.
			await expect(
				createBlackoutDate(db, createMockBlackoutDateData({ date: '2024-07-04' }), OTHER)
			).resolves.toBeDefined();

			expect(await getBlackoutDates(db, SCHEDULE_ID)).toHaveLength(1);
			expect(await getBlackoutDates(db, OTHER)).toHaveLength(1);
		});

		it('will not delete a blackout owned by another schedule', async () => {
			const mine = await createBlackoutDateDirect(db, { schedule_id: SCHEDULE_ID });

			await expect(deleteBlackoutDate(db, mine.id, OTHER)).rejects.toThrow(NotFoundError);
			// Still there.
			expect(await getBlackoutDateById(db, mine.id)).not.toBeNull();

			// Correct owner can delete it.
			await deleteBlackoutDate(db, mine.id, SCHEDULE_ID);
			expect(await getBlackoutDateById(db, mine.id)).toBeNull();
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
