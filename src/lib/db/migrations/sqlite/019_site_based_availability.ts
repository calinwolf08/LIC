import { Kysely, sql } from 'kysely';

/**
 * Migration: Site-Based Availability
 *
 * This migration updates the schema to support site-specific preceptor availability:
 * 1. Add site_id to preceptor_availability (required - preceptor available at specific site on specific date)
 * 2. Add site_id to preceptor_availability_patterns (required - patterns apply to specific sites)
 * 3. Add site_id to schedule_assignments (tracks where the assignment takes place)
 * 4. Remove site_id from preceptors (no longer have a single primary site)
 */

export async function up(db: Kysely<any>): Promise<void> {
	// 1. Recreate preceptor_availability with site_id (required)
	// SQLite doesn't support adding NOT NULL columns, so we recreate the table
	await db.schema
		.createTable('preceptor_availability_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Create unique constraint: one availability record per preceptor/site/date
	await sql`CREATE UNIQUE INDEX idx_preceptor_availability_unique
		ON preceptor_availability_new(preceptor_id, site_id, date)`.execute(db);

	// Drop old table and rename new one
	await db.schema.dropTable('preceptor_availability').execute();
	await sql`ALTER TABLE preceptor_availability_new RENAME TO preceptor_availability`.execute(db);

	// 2. Recreate preceptor_availability_patterns with site_id (required)
	await db.schema
		.createTable('preceptor_availability_patterns_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('site_id', 'text', (col) => col.notNull())
		.addColumn('pattern_type', 'text', (col) => col.notNull())
		.addColumn('config', 'text')
		.addColumn('date_range_start', 'text', (col) => col.notNull())
		.addColumn('date_range_end', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('reason', 'text')
		.addColumn('specificity', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Drop old table and rename new one
	await db.schema.dropTable('preceptor_availability_patterns').execute();
	await sql`ALTER TABLE preceptor_availability_patterns_new RENAME TO preceptor_availability_patterns`.execute(db);

	// 3. Add site_id to schedule_assignments
	await db.schema
		.alterTable('schedule_assignments')
		.addColumn('site_id', 'text')
		.execute();

	// 4. Remove site_id from preceptors
	// SQLite doesn't support DROP COLUMN directly, so we recreate the table
	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Copy data (excluding site_id)
	await sql`INSERT INTO preceptors_new (id, name, email, phone, health_system_id, max_students, created_at, updated_at)
		SELECT id, name, email, phone, health_system_id, max_students, created_at, updated_at FROM preceptors`.execute(db);

	// Drop old table and rename new one
	await db.schema.dropTable('preceptors').execute();
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	// Create indexes for performance
	await sql`CREATE INDEX idx_preceptor_availability_preceptor ON preceptor_availability(preceptor_id)`.execute(db);
	await sql`CREATE INDEX idx_preceptor_availability_site ON preceptor_availability(site_id)`.execute(db);
	await sql`CREATE INDEX idx_preceptor_availability_date ON preceptor_availability(date)`.execute(db);
	await sql`CREATE INDEX idx_preceptor_availability_patterns_preceptor ON preceptor_availability_patterns(preceptor_id)`.execute(db);
	await sql`CREATE INDEX idx_preceptor_availability_patterns_site ON preceptor_availability_patterns(site_id)`.execute(db);
	await sql`CREATE INDEX idx_schedule_assignments_site ON schedule_assignments(site_id)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	// Reverse the migration - add site_id back to preceptors, remove from availability tables

	// 1. Recreate preceptors with site_id
	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull())
		.addColumn('phone', 'text')
		.addColumn('health_system_id', 'text')
		.addColumn('site_id', 'text')
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await sql`INSERT INTO preceptors_new (id, name, email, phone, health_system_id, max_students, created_at, updated_at)
		SELECT id, name, email, phone, health_system_id, max_students, created_at, updated_at FROM preceptors`.execute(db);

	await db.schema.dropTable('preceptors').execute();
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	// 2. Recreate preceptor_availability without site_id
	await db.schema
		.createTable('preceptor_availability_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await db.schema.dropTable('preceptor_availability').execute();
	await sql`ALTER TABLE preceptor_availability_new RENAME TO preceptor_availability`.execute(db);

	// 3. Recreate preceptor_availability_patterns without site_id
	await db.schema
		.createTable('preceptor_availability_patterns_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('pattern_type', 'text', (col) => col.notNull())
		.addColumn('config', 'text')
		.addColumn('date_range_start', 'text', (col) => col.notNull())
		.addColumn('date_range_end', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('reason', 'text')
		.addColumn('specificity', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await db.schema.dropTable('preceptor_availability_patterns').execute();
	await sql`ALTER TABLE preceptor_availability_patterns_new RENAME TO preceptor_availability_patterns`.execute(db);

	// 4. Remove site_id from schedule_assignments (recreate table)
	await db.schema
		.createTable('schedule_assignments_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) => col.notNull())
		.addColumn('preceptor_id', 'text', (col) => col.notNull())
		.addColumn('clerkship_id', 'text', (col) => col.notNull())
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('status', 'text', (col) => col.notNull().defaultTo('scheduled'))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	await sql`INSERT INTO schedule_assignments_new (id, student_id, preceptor_id, clerkship_id, date, status, created_at, updated_at)
		SELECT id, student_id, preceptor_id, clerkship_id, date, status, created_at, updated_at FROM schedule_assignments`.execute(db);

	await db.schema.dropTable('schedule_assignments').execute();
	await sql`ALTER TABLE schedule_assignments_new RENAME TO schedule_assignments`.execute(db);
}
