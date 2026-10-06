import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	getQuartersBySchedule,
	replaceQuarters,
	quarterForDate
} from './quarter-service';

const SCHEDULE = 'sched-q';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHEDULE,
			name: 'Year',
			start_date: '2026-01-01',
			end_date: '2026-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

describe('quarter-service (M4)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('replaces and lists quarters ordered by start date', async () => {
		await replaceQuarters(db, SCHEDULE, [
			{ name: 'Q2', start_date: '2026-04-01', end_date: '2026-06-30' },
			{ name: 'Q1', start_date: '2026-01-01', end_date: '2026-03-31' }
		]);
		const rows = await getQuartersBySchedule(db, SCHEDULE);
		expect(rows.map((r) => r.name)).toEqual(['Q1', 'Q2']);
	});

	it('replace is a full swap — the second call wins', async () => {
		await replaceQuarters(db, SCHEDULE, [
			{ name: 'Q1', start_date: '2026-01-01', end_date: '2026-03-31' }
		]);
		await replaceQuarters(db, SCHEDULE, [
			{ name: 'H1', start_date: '2026-01-01', end_date: '2026-06-30' }
		]);
		const rows = await getQuartersBySchedule(db, SCHEDULE);
		expect(rows.map((r) => r.name)).toEqual(['H1']);
	});

	it('rejects a quarter that ends before it starts', async () => {
		await expect(
			replaceQuarters(db, SCHEDULE, [
				{ name: 'Bad', start_date: '2026-06-30', end_date: '2026-04-01' }
			])
		).rejects.toThrow();
	});

	it('an empty set clears all quarters', async () => {
		await replaceQuarters(db, SCHEDULE, [
			{ name: 'Q1', start_date: '2026-01-01', end_date: '2026-03-31' }
		]);
		await replaceQuarters(db, SCHEDULE, []);
		expect(await getQuartersBySchedule(db, SCHEDULE)).toHaveLength(0);
	});

	describe('quarterForDate boundaries', () => {
		const quarters = [
			{ name: 'Q1', start_date: '2026-01-01', end_date: '2026-03-31' },
			{ name: 'Q2', start_date: '2026-04-01', end_date: '2026-06-30' }
		];
		it('maps a date to the quarter that contains it (inclusive ends)', () => {
			expect(quarterForDate(quarters, '2026-01-01')).toBe('Q1'); // start edge
			expect(quarterForDate(quarters, '2026-03-31')).toBe('Q1'); // end edge
			expect(quarterForDate(quarters, '2026-04-01')).toBe('Q2'); // next start edge
			expect(quarterForDate(quarters, '2026-05-15')).toBe('Q2');
		});
		it('returns null for a date in no quarter', () => {
			expect(quarterForDate(quarters, '2026-07-01')).toBeNull();
			expect(quarterForDate(quarters, '2025-12-31')).toBeNull();
		});
	});
});
