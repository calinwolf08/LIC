/**
 * Strategy Context Builder Tests
 *
 * Tests for the StrategyContextBuilder, particularly date generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import { StrategyContextBuilder } from './strategy-context';

/**
 * Create test database with in-memory SQLite
 */
function createTestDb(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	return new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite
		})
	});
}

/**
 * Initialize minimal schema for testing
 */
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

describe('StrategyContextBuilder', () => {
	let db: Kysely<DB>;
	let builder: StrategyContextBuilder;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
		builder = new StrategyContextBuilder(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('buildAvailableDates - Timezone Regression Tests', () => {
		/**
		 * Helper to get UTC day of week from date string
		 */
		function getUTCDayOfWeek(dateStr: string): number {
			return new Date(dateStr + 'T00:00:00.000Z').getUTCDay();
		}

		it('generates correct dates for Mon Dec 1, 2025 start date (timezone regression)', async () => {
			// Access private method via reflection for testing
			const buildAvailableDates = (builder as any).buildAvailableDates.bind(builder);

			// December 2025: Dec 1 is a Monday
			const dates = await buildAvailableDates(
				{ id: 'test-clerkship' },
				{ id: 'test-student' },
				'2025-12-01',
				'2025-12-07'
			);

			// First date should be 2025-12-01 (Monday)
			expect(dates[0]).toBe('2025-12-01');

			// Verify the first date is actually Monday in UTC
			const firstDayOfWeek = getUTCDayOfWeek(dates[0]);
			expect(firstDayOfWeek).toBe(1); // 1 = Monday

			// Verify all 7 days are present
			expect(dates).toHaveLength(7);
			expect(dates).toEqual([
				'2025-12-01', // Monday
				'2025-12-02', // Tuesday
				'2025-12-03', // Wednesday
				'2025-12-04', // Thursday
				'2025-12-05', // Friday
				'2025-12-06', // Saturday
				'2025-12-07'  // Sunday
			]);
		});

		it('does not shift dates back by one day (timezone bug detection)', async () => {
			const buildAvailableDates = (builder as any).buildAvailableDates.bind(builder);

			const dates = await buildAvailableDates(
				{ id: 'test-clerkship' },
				{ id: 'test-student' },
				'2025-12-01',
				'2025-12-31'
			);

			// Bug would produce dates starting with 2025-11-30 instead of 2025-12-01
			expect(dates[0]).not.toBe('2025-11-30');
			expect(dates[0]).toBe('2025-12-01');

			// Verify each date matches expected day of week
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

			// Dec 1, 2025 is Monday - verify this
			const dec1DayOfWeek = getUTCDayOfWeek('2025-12-01');
			expect(dec1DayOfWeek).toBe(1); // Monday

			// First 7 dates should be Mon through Sun
			const expectedDays = [1, 2, 3, 4, 5, 6, 0]; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
			for (let i = 0; i < 7; i++) {
				const dayOfWeek = getUTCDayOfWeek(dates[i]);
				expect(dayOfWeek, `Date ${dates[i]} should be ${dayNames[expectedDays[i]]}`).toBe(expectedDays[i]);
			}
		});

		it('correctly excludes blackout dates', async () => {
			// Add a blackout date
			await db.insertInto('blackout_dates').values({
				id: 'blackout-1',
				date: '2025-12-03',
				reason: 'Holiday',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}).execute();

			const buildAvailableDates = (builder as any).buildAvailableDates.bind(builder);

			const dates = await buildAvailableDates(
				{ id: 'test-clerkship' },
				{ id: 'test-student' },
				'2025-12-01',
				'2025-12-07'
			);

			// Should have 6 dates (7 - 1 blackout)
			expect(dates).toHaveLength(6);
			expect(dates).not.toContain('2025-12-03');
			expect(dates).toContain('2025-12-01');
			expect(dates).toContain('2025-12-02');
			expect(dates).toContain('2025-12-04');
		});

		it('handles year boundary correctly', async () => {
			const buildAvailableDates = (builder as any).buildAvailableDates.bind(builder);

			const dates = await buildAvailableDates(
				{ id: 'test-clerkship' },
				{ id: 'test-student' },
				'2025-12-29',
				'2026-01-03'
			);

			expect(dates).toEqual([
				'2025-12-29',
				'2025-12-30',
				'2025-12-31',
				'2026-01-01',
				'2026-01-02',
				'2026-01-03'
			]);
		});
	});
});
