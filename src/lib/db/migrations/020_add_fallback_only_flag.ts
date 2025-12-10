import { Kysely, sql } from 'kysely';

/**
 * Migration: Add fallback-only flags
 *
 * Adds is_fallback_only to preceptor_team_members and is_global_fallback_only to preceptors.
 * These flags control whether a preceptor can be assigned as a primary preceptor or only as a fallback.
 *
 * - preceptor_team_members.is_fallback_only: Preceptor is fallback-only for this specific team
 * - preceptors.is_global_fallback_only: Preceptor is fallback-only across all teams
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Add is_fallback_only to preceptor_team_members (0 = can be primary, 1 = fallback only)
	await db.schema
		.alterTable('preceptor_team_members')
		.addColumn('is_fallback_only', 'integer', (col) => col.defaultTo(0))
		.execute();

	// Add is_global_fallback_only to preceptors (0 = can be primary, 1 = fallback only everywhere)
	await db.schema
		.alterTable('preceptors')
		.addColumn('is_global_fallback_only', 'integer', (col) => col.defaultTo(0))
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN directly, so we need to recreate tables

	// 1. Recreate preceptor_team_members without is_fallback_only
	await db.schema
		.createTable('preceptor_team_members_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('team_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('priority', 'integer', (col) => col.defaultTo(1))
		.addColumn('role', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.execute();

	await sql`INSERT INTO preceptor_team_members_new (id, team_id, preceptor_id, priority, role, created_at)
		SELECT id, team_id, preceptor_id, priority, role, created_at FROM preceptor_team_members`.execute(db);

	await db.schema.dropTable('preceptor_team_members').execute();
	await sql`ALTER TABLE preceptor_team_members_new RENAME TO preceptor_team_members`.execute(db);

	// 2. Recreate preceptors without is_global_fallback_only
	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('updated_at', 'text', (col) => col.notNull())
		.execute();

	await sql`INSERT INTO preceptors_new (id, name, email, phone, health_system_id, max_students, created_at, updated_at)
		SELECT id, name, email, phone, health_system_id, max_students, created_at, updated_at FROM preceptors`.execute(db);

	await db.schema.dropTable('preceptors').execute();
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);
}
