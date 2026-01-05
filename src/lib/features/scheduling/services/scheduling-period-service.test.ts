// @ts-nocheck
/**
 * Scheduling Period Service Tests
 *
 * Unit tests for scheduling period CRUD operations and queries
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from '$lib/db/types';
import {
	getSchedulingPeriods,
	getSchedulingPeriodById,
	getActiveSchedulingPeriod,
	createSchedulingPeriod,
	updateSchedulingPeriod,
	deleteSchedulingPeriod,
	activateSchedulingPeriod,
	deactivateAllSchedulingPeriods,
	schedulingPeriodExists,
	getOverlappingPeriods,
	getUpcomingPeriods,
	getPastPeriods,
	getCurrentPeriods
} from './scheduling-period-service';
import { NotFoundError, ConflictError } from '$lib/api/errors';

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
 * Initialize database schema
 */
async function initializeSchema(db: Kysely<DB>) {
	await db.schema
		.createTable('scheduling_periods')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('start_date', 'text', (col) => col.notNull())
		.addColumn('end_date', 'text', (col) => col.notNull())
		.addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	// Create schedule scoping tables (needed by deleteSchedulingPeriod)
	await db.schema
		.createTable('schedule_students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_teams')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('team_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('configuration_id', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text')
		.execute();
}

describe('Scheduling Period Service', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = createTestDb();
		await initializeSchema(db);
	});

	afterEach(async () => {
		await db.destroy();
	});

	describe('CRUD Operations', () => {
		describe('createSchedulingPeriod()', () => {
			it('creates a new scheduling period', async () => {
				const period = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				expect(period.id).toBeDefined();
				expect(period.name).toBe('Fall 2024');
				expect(period.start_date).toBe('2024-09-01');
				expect(period.end_date).toBe('2024-12-15');
				expect(period.is_active).toBe(0);
				expect(period.created_at).toBeDefined();
				expect(period.updated_at).toBeDefined();
			});

			it('creates an active scheduling period when none exists', async () => {
				const period = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				expect(period.is_active).toBe(1);
			});

			it('throws ConflictError when creating active period if one already exists', async () => {
				// Create first active period
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				// Try to create another active period
				await expect(
					createSchedulingPeriod(db, {
						name: 'Spring 2025',
						start_date: '2025-01-15',
						end_date: '2025-05-15',
						is_active: true
					})
				).rejects.toThrow(ConflictError);
			});

			it('allows creating inactive period when active exists', async () => {
				// Create active period
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				// Create inactive period
				const period = await createSchedulingPeriod(db, {
					name: 'Spring 2025',
					start_date: '2025-01-15',
					end_date: '2025-05-15',
					is_active: false
				});

				expect(period.is_active).toBe(0);
			});
		});

		describe('getSchedulingPeriods()', () => {
			it('returns empty array when no periods exist', async () => {
				const periods = await getSchedulingPeriods(db);
				expect(periods).toEqual([]);
			});

			it('returns all periods ordered by start_date descending', async () => {
				await createSchedulingPeriod(db, {
					name: 'Spring 2024',
					start_date: '2024-01-15',
					end_date: '2024-05-15',
					is_active: false
				});

				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const periods = await getSchedulingPeriods(db);

				expect(periods).toHaveLength(2);
				expect(periods[0].name).toBe('Fall 2024'); // Most recent first
				expect(periods[1].name).toBe('Spring 2024');
			});
		});

		describe('getSchedulingPeriodById()', () => {
			it('returns period when found', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const found = await getSchedulingPeriodById(db, created.id);

				expect(found).not.toBeNull();
				expect(found!.id).toBe(created.id);
				expect(found!.name).toBe('Fall 2024');
			});

			it('returns null when not found', async () => {
				const found = await getSchedulingPeriodById(db, 'nonexistent-id');
				expect(found).toBeNull();
			});
		});

		describe('getActiveSchedulingPeriod()', () => {
			it('returns null when no active period', async () => {
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const active = await getActiveSchedulingPeriod(db);
				expect(active).toBeNull();
			});

			it('returns active period', async () => {
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				const active = await getActiveSchedulingPeriod(db);

				expect(active).not.toBeNull();
				expect(active!.name).toBe('Fall 2024');
				expect(active!.is_active).toBe(1);
			});
		});

		describe('updateSchedulingPeriod()', () => {
			it('updates period name', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const updated = await updateSchedulingPeriod(db, created.id, {
					name: 'Fall 2024 - Updated'
				});

				expect(updated.name).toBe('Fall 2024 - Updated');
			});

			it('updates period dates', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const updated = await updateSchedulingPeriod(db, created.id, {
					start_date: '2024-09-15',
					end_date: '2024-12-20'
				});

				expect(updated.start_date).toBe('2024-09-15');
				expect(updated.end_date).toBe('2024-12-20');
			});

			it('throws NotFoundError when period not found', async () => {
				await expect(
					updateSchedulingPeriod(db, 'nonexistent-id', { name: 'New Name' })
				).rejects.toThrow(NotFoundError);
			});

			it('throws ConflictError when activating while another is active', async () => {
				const active = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				const inactive = await createSchedulingPeriod(db, {
					name: 'Spring 2025',
					start_date: '2025-01-15',
					end_date: '2025-05-15',
					is_active: false
				});

				await expect(
					updateSchedulingPeriod(db, inactive.id, { is_active: true })
				).rejects.toThrow(ConflictError);
			});

			it('allows updating active period without conflict', async () => {
				const active = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				// Updating active=true on already active period should work
				const updated = await updateSchedulingPeriod(db, active.id, {
					name: 'Fall 2024 - Updated',
					is_active: true
				});

				expect(updated.name).toBe('Fall 2024 - Updated');
				expect(updated.is_active).toBe(1);
			});

			it('updates updated_at timestamp', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				// Small delay to ensure timestamp difference
				await new Promise(resolve => setTimeout(resolve, 10));

				const updated = await updateSchedulingPeriod(db, created.id, {
					name: 'Fall 2024 - Updated'
				});

				expect(updated.updated_at).not.toBe(created.updated_at);
			});
		});

		describe('deleteSchedulingPeriod()', () => {
			it('deletes inactive period', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				await deleteSchedulingPeriod(db, created.id);

				const found = await getSchedulingPeriodById(db, created.id);
				expect(found).toBeNull();
			});

			it('throws NotFoundError when period not found', async () => {
				await expect(
					deleteSchedulingPeriod(db, 'nonexistent-id')
				).rejects.toThrow(NotFoundError);
			});

			it('throws ConflictError when deleting active period', async () => {
				const active = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				await expect(
					deleteSchedulingPeriod(db, active.id)
				).rejects.toThrow(ConflictError);
			});
		});

		describe('activateSchedulingPeriod()', () => {
			it('activates a period and deactivates others', async () => {
				const period1 = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				const period2 = await createSchedulingPeriod(db, {
					name: 'Spring 2025',
					start_date: '2025-01-15',
					end_date: '2025-05-15',
					is_active: false
				});

				// Activate period2
				const activated = await activateSchedulingPeriod(db, period2.id);

				expect(activated.is_active).toBe(1);

				// Check period1 is now inactive
				const period1Updated = await getSchedulingPeriodById(db, period1.id);
				expect(period1Updated!.is_active).toBe(0);
			});

			it('throws NotFoundError when period not found', async () => {
				await expect(
					activateSchedulingPeriod(db, 'nonexistent-id')
				).rejects.toThrow(NotFoundError);
			});
		});

		describe('deactivateAllSchedulingPeriods()', () => {
			it('deactivates all active periods', async () => {
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: true
				});

				await deactivateAllSchedulingPeriods(db);

				const active = await getActiveSchedulingPeriod(db);
				expect(active).toBeNull();
			});

			it('does nothing when no active periods', async () => {
				await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				// Should not throw
				await deactivateAllSchedulingPeriods(db);

				const active = await getActiveSchedulingPeriod(db);
				expect(active).toBeNull();
			});
		});
	});

	describe('Query Helpers', () => {
		describe('schedulingPeriodExists()', () => {
			it('returns true when period exists', async () => {
				const created = await createSchedulingPeriod(db, {
					name: 'Fall 2024',
					start_date: '2024-09-01',
					end_date: '2024-12-15',
					is_active: false
				});

				const exists = await schedulingPeriodExists(db, created.id);
				expect(exists).toBe(true);
			});

			it('returns false when period does not exist', async () => {
				const exists = await schedulingPeriodExists(db, 'nonexistent-id');
				expect(exists).toBe(false);
			});
		});

		describe('getOverlappingPeriods()', () => {
			beforeEach(async () => {
				// Create periods: Jan-Mar, Apr-Jun, Jul-Sep
				await createSchedulingPeriod(db, {
					name: 'Q1 2024',
					start_date: '2024-01-01',
					end_date: '2024-03-31',
					is_active: false
				});
				await createSchedulingPeriod(db, {
					name: 'Q2 2024',
					start_date: '2024-04-01',
					end_date: '2024-06-30',
					is_active: false
				});
				await createSchedulingPeriod(db, {
					name: 'Q3 2024',
					start_date: '2024-07-01',
					end_date: '2024-09-30',
					is_active: false
				});
			});

			it('finds periods overlapping with date range', async () => {
				// Query for Feb-May (overlaps Q1 and Q2)
				const overlapping = await getOverlappingPeriods(db, '2024-02-15', '2024-05-15');

				expect(overlapping).toHaveLength(2);
				const names = overlapping.map(p => p.name);
				expect(names).toContain('Q1 2024');
				expect(names).toContain('Q2 2024');
			});

			it('finds period that contains the date range', async () => {
				// Query for Feb only (within Q1)
				const overlapping = await getOverlappingPeriods(db, '2024-02-01', '2024-02-28');

				expect(overlapping).toHaveLength(1);
				expect(overlapping[0].name).toBe('Q1 2024');
			});

			it('returns empty when no overlap', async () => {
				// Query for Oct-Nov (no overlap)
				const overlapping = await getOverlappingPeriods(db, '2024-10-01', '2024-11-30');

				expect(overlapping).toHaveLength(0);
			});
		});

		describe('getUpcomingPeriods()', () => {
			it('returns periods with start date in the future', async () => {
				// Create past period
				await createSchedulingPeriod(db, {
					name: 'Past',
					start_date: '2020-01-01',
					end_date: '2020-06-30',
					is_active: false
				});

				// Create future period
				await createSchedulingPeriod(db, {
					name: 'Future',
					start_date: '2030-01-01',
					end_date: '2030-06-30',
					is_active: false
				});

				const upcoming = await getUpcomingPeriods(db);

				expect(upcoming).toHaveLength(1);
				expect(upcoming[0].name).toBe('Future');
			});

			it('returns periods ordered by start_date ascending', async () => {
				await createSchedulingPeriod(db, {
					name: 'Later',
					start_date: '2031-01-01',
					end_date: '2031-06-30',
					is_active: false
				});

				await createSchedulingPeriod(db, {
					name: 'Sooner',
					start_date: '2030-01-01',
					end_date: '2030-06-30',
					is_active: false
				});

				const upcoming = await getUpcomingPeriods(db);

				expect(upcoming).toHaveLength(2);
				expect(upcoming[0].name).toBe('Sooner');
				expect(upcoming[1].name).toBe('Later');
			});
		});

		describe('getPastPeriods()', () => {
			it('returns periods with end date in the past', async () => {
				// Create past period
				await createSchedulingPeriod(db, {
					name: 'Past',
					start_date: '2020-01-01',
					end_date: '2020-06-30',
					is_active: false
				});

				// Create future period
				await createSchedulingPeriod(db, {
					name: 'Future',
					start_date: '2030-01-01',
					end_date: '2030-06-30',
					is_active: false
				});

				const past = await getPastPeriods(db);

				expect(past).toHaveLength(1);
				expect(past[0].name).toBe('Past');
			});

			it('returns periods ordered by end_date descending', async () => {
				await createSchedulingPeriod(db, {
					name: 'Older',
					start_date: '2019-01-01',
					end_date: '2019-06-30',
					is_active: false
				});

				await createSchedulingPeriod(db, {
					name: 'Newer',
					start_date: '2020-01-01',
					end_date: '2020-06-30',
					is_active: false
				});

				const past = await getPastPeriods(db);

				expect(past).toHaveLength(2);
				expect(past[0].name).toBe('Newer');
				expect(past[1].name).toBe('Older');
			});
		});

		describe('getCurrentPeriods()', () => {
			it('returns periods that include today', async () => {
				const today = new Date();
				const startDate = new Date(today);
				startDate.setMonth(today.getMonth() - 1);
				const endDate = new Date(today);
				endDate.setMonth(today.getMonth() + 1);

				// Create current period
				await createSchedulingPeriod(db, {
					name: 'Current',
					start_date: startDate.toISOString().split('T')[0],
					end_date: endDate.toISOString().split('T')[0],
					is_active: false
				});

				// Create past period
				await createSchedulingPeriod(db, {
					name: 'Past',
					start_date: '2020-01-01',
					end_date: '2020-06-30',
					is_active: false
				});

				const current = await getCurrentPeriods(db);

				expect(current).toHaveLength(1);
				expect(current[0].name).toBe('Current');
			});

			it('returns periods ordered by start_date ascending', async () => {
				const today = new Date();
				const startDate1 = new Date(today);
				startDate1.setMonth(today.getMonth() - 2);
				const startDate2 = new Date(today);
				startDate2.setMonth(today.getMonth() - 1);
				const endDate = new Date(today);
				endDate.setMonth(today.getMonth() + 1);

				await createSchedulingPeriod(db, {
					name: 'Started Earlier',
					start_date: startDate1.toISOString().split('T')[0],
					end_date: endDate.toISOString().split('T')[0],
					is_active: false
				});

				await createSchedulingPeriod(db, {
					name: 'Started Later',
					start_date: startDate2.toISOString().split('T')[0],
					end_date: endDate.toISOString().split('T')[0],
					is_active: false
				});

				const current = await getCurrentPeriods(db);

				expect(current).toHaveLength(2);
				expect(current[0].name).toBe('Started Earlier');
				expect(current[1].name).toBe('Started Later');
			});
		});
	});
});
