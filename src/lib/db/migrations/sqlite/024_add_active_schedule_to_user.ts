/**
 * Migration 024: Add active_schedule_id to user table (idempotent)
 *
 * This migration ensures the active_schedule_id column exists on the user table.
 * It handles the case where:
 * 1. The user table was created by better-auth AFTER migration 023 ran
 * 2. Migration 023 skipped adding the column because user table didn't exist yet
 *
 * This is an idempotent migration - safe to run multiple times.
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Check if user table exists
	const userTableExists = await sql<{ count: number }>`
		SELECT COUNT(*) as count FROM sqlite_master
		WHERE type='table' AND name='user'
	`.execute(db);

	if (userTableExists.rows[0]?.count === 0) {
		// User table doesn't exist yet - nothing to do
		// better-auth will create it when first user signs up
		console.log('User table does not exist yet, skipping column addition');
		return;
	}

	// Check if the column already exists
	const columnExists = await sql<{ count: number }>`
		SELECT COUNT(*) as count FROM pragma_table_info('user')
		WHERE name = 'active_schedule_id'
	`.execute(db);

	if (columnExists.rows[0]?.count > 0) {
		console.log('active_schedule_id column already exists, skipping');
		return;
	}

	// Add the column
	console.log('Adding active_schedule_id column to user table');
	await db.schema
		.alterTable('user')
		.addColumn('active_schedule_id', 'text')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN easily
	// The column will remain but be unused after rollback
	console.log('Note: active_schedule_id column cannot be dropped in SQLite');
}
