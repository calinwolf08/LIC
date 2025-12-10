/**
 * Migration 023: Schedule User Ownership
 *
 * Adds user ownership to schedules and active schedule tracking:
 * 1. Add user_id to scheduling_periods (schedule belongs to a user)
 * 2. Add active_schedule_id to user table (user's currently active schedule)
 *
 * This enables the "schedule-first" architecture where:
 * - Users must have an active schedule to work with entities
 * - Schedules are owned by users
 * - Each user has exactly one active schedule at a time
 */

import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Add user_id column to scheduling_periods
	// Note: SQLite doesn't support adding foreign key constraints via ALTER TABLE,
	// so we add the column without the constraint. Referential integrity is
	// enforced at the application level.
	await db.schema
		.alterTable('scheduling_periods')
		.addColumn('user_id', 'text')
		.execute();

	// Create index for efficient lookup of user's schedules
	await db.schema
		.createIndex('idx_scheduling_periods_user_id')
		.on('scheduling_periods')
		.column('user_id')
		.execute();

	// Add active_schedule_id column to user table
	// Note: The user table is managed by better-auth, but we can add columns to it.
	// No foreign key constraint for SQLite compatibility.
	await db.schema
		.alterTable('user')
		.addColumn('active_schedule_id', 'text')
		.execute();

	// Note: Existing schedules will have NULL user_id.
	// The seed script or first user login will need to claim orphaned schedules
	// or create new ones.
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN directly.
	// For a proper rollback, we'd need to recreate the tables.
	// For simplicity, we'll just drop the index.

	try {
		await db.schema.dropIndex('idx_scheduling_periods_user_id').execute();
	} catch {
		// Index may not exist
	}

	// Note: Columns cannot be easily dropped in SQLite.
	// The user_id and active_schedule_id columns will remain but be unused.
	// A full rollback would require recreating the tables without these columns.
}
