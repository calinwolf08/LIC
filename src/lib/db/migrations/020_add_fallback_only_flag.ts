/**
 * Migration 020: Add Fallback-Only Flag
 *
 * Adds support for marking preceptors as "fallback-only" at both
 * the team level (preceptor_team_members) and global level (preceptors).
 *
 * Features:
 * - is_fallback_only on preceptor_team_members: Team-level fallback flag
 * - is_global_fallback_only on preceptors: Global fallback flag
 *
 * Fallback-only preceptors are only used when primary preceptors'
 * capacity is exhausted.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Add is_fallback_only to preceptor_team_members
	await sql`ALTER TABLE preceptor_team_members ADD COLUMN is_fallback_only INTEGER DEFAULT 0`.execute(db);

	// Add is_global_fallback_only to preceptors
	await sql`ALTER TABLE preceptors ADD COLUMN is_global_fallback_only INTEGER DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN directly
	// Would need to recreate tables without the columns
	console.warn('Migration 020 down: SQLite does not support DROP COLUMN. Manual intervention required.');
}
