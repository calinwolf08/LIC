/**
 * Migration 026: Add welcome_completed to user table (idempotent)
 *
 * This migration adds a welcome_completed flag to track whether a user
 * has completed the initial onboarding/welcome modal. This ensures the
 * modal only shows once, persisted across browsers and devices.
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
		WHERE name = 'welcome_completed'
	`.execute(db);

	if (columnExists.rows[0]?.count > 0) {
		console.log('welcome_completed column already exists, skipping');
		return;
	}

	// Add the column with default value of 0 (false)
	console.log('Adding welcome_completed column to user table');
	await sql`
		ALTER TABLE user ADD COLUMN welcome_completed INTEGER DEFAULT 0
	`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN easily
	// The column will remain but be unused after rollback
	console.log('Note: welcome_completed column cannot be dropped in SQLite');
}
