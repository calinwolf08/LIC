/**
 * Migration 021: Elective Enhancements
 *
 * Adds:
 * - is_required column to clerkship_electives (required vs optional electives)
 * - elective_sites junction table for site associations
 * - elective_preceptors junction table for preceptor associations
 * - elective_id column to schedule_assignments for tracking elective assignments
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Add is_required column to clerkship_electives
	await db.schema
		.alterTable('clerkship_electives')
		.addColumn('is_required', 'integer', (col) => col.notNull().defaultTo(1))
		.execute();

	// Create elective_sites junction table
	await db.schema
		.createTable('elective_sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('elective_id', 'text', (col) =>
			col.notNull().references('clerkship_electives.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Create unique index on elective_sites
	await db.schema
		.createIndex('idx_elective_sites_unique')
		.on('elective_sites')
		.columns(['elective_id', 'site_id'])
		.unique()
		.execute();

	// Create index for elective lookups
	await db.schema
		.createIndex('idx_elective_sites_elective')
		.on('elective_sites')
		.column('elective_id')
		.execute();

	// Create index for site lookups
	await db.schema
		.createIndex('idx_elective_sites_site')
		.on('elective_sites')
		.column('site_id')
		.execute();

	// Create elective_preceptors junction table
	await db.schema
		.createTable('elective_preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('elective_id', 'text', (col) =>
			col.notNull().references('clerkship_electives.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Create unique index on elective_preceptors
	await db.schema
		.createIndex('idx_elective_preceptors_unique')
		.on('elective_preceptors')
		.columns(['elective_id', 'preceptor_id'])
		.unique()
		.execute();

	// Create index for elective lookups
	await db.schema
		.createIndex('idx_elective_preceptors_elective')
		.on('elective_preceptors')
		.column('elective_id')
		.execute();

	// Create index for preceptor lookups
	await db.schema
		.createIndex('idx_elective_preceptors_preceptor')
		.on('elective_preceptors')
		.column('preceptor_id')
		.execute();

	// Add elective_id column to schedule_assignments
	await db.schema
		.alterTable('schedule_assignments')
		.addColumn('elective_id', 'text', (col) =>
			col.references('clerkship_electives.id').onDelete('set null')
		)
		.execute();

	// Create index for elective assignment lookups
	await db.schema
		.createIndex('idx_assignments_elective')
		.on('schedule_assignments')
		.column('elective_id')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop index on schedule_assignments
	await db.schema.dropIndex('idx_assignments_elective').execute();

	// SQLite doesn't support DROP COLUMN, but Kysely will handle this
	// by recreating the table without the column
	await db.schema
		.alterTable('schedule_assignments')
		.dropColumn('elective_id')
		.execute();

	// Drop elective_preceptors table
	await db.schema.dropTable('elective_preceptors').execute();

	// Drop elective_sites table
	await db.schema.dropTable('elective_sites').execute();

	// Drop is_required column from clerkship_electives
	await db.schema
		.alterTable('clerkship_electives')
		.dropColumn('is_required')
		.execute();
}
