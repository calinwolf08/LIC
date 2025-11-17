import { Kysely, sql } from 'kysely';

/**
 * Initial database schema migration
 * Creates all tables for LIC Scheduling App
 */

export async function up(db: Kysely<any>): Promise<void> {
	// ========================================
	// Students Table
	// ========================================
	await db.schema
		.createTable('students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for email lookups
	await db.schema
		.createIndex('idx_students_email')
		.on('students')
		.column('email')
		.execute();

	// ========================================
	// Preceptors Table
	// ========================================
	await db.schema
		.createTable('preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for email lookups
	await db.schema
		.createIndex('idx_preceptors_email')
		.on('preceptors')
		.column('email')
		.execute();

	// Index for specialty filtering
	await db.schema
		.createIndex('idx_preceptors_specialty')
		.on('preceptors')
		.column('specialty')
		.execute();

	// ========================================
	// Preceptor Availability Table
	// ========================================
	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint: one availability record per preceptor per date
	await db.schema
		.createIndex('idx_availability_preceptor_date')
		.on('preceptor_availability')
		.columns(['preceptor_id', 'date'])
		.unique()
		.execute();

	// Index for date range queries
	await db.schema
		.createIndex('idx_availability_date')
		.on('preceptor_availability')
		.column('date')
		.execute();

	// ========================================
	// Clerkships Table
	// ========================================
	await db.schema
		.createTable('clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for specialty matching with preceptors
	await db.schema
		.createIndex('idx_clerkships_specialty')
		.on('clerkships')
		.column('specialty')
		.execute();

	// ========================================
	// Blackout Dates Table
	// ========================================
	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull().unique())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for date lookups
	await db.schema
		.createIndex('idx_blackout_dates_date')
		.on('blackout_dates')
		.column('date')
		.unique()
		.execute();

	// ========================================
	// Schedule Assignments Table
	// ========================================
	await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('restrict')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('restrict')
		)
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('status', 'text', (col) => col.notNull().defaultTo('scheduled'))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint: student cannot be double-booked on same date
	await db.schema
		.createIndex('idx_assignments_student_date')
		.on('schedule_assignments')
		.columns(['student_id', 'date'])
		.unique()
		.execute();

	// Index for preceptor capacity checks
	await db.schema
		.createIndex('idx_assignments_preceptor_date')
		.on('schedule_assignments')
		.columns(['preceptor_id', 'date'])
		.execute();

	// Index for calendar date queries
	await db.schema
		.createIndex('idx_assignments_date')
		.on('schedule_assignments')
		.column('date')
		.execute();

	// Index for requirement tracking
	await db.schema
		.createIndex('idx_assignments_clerkship')
		.on('schedule_assignments')
		.column('clerkship_id')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop tables in reverse order to handle foreign key dependencies
	await db.schema.dropTable('schedule_assignments').execute();
	await db.schema.dropTable('blackout_dates').execute();
	await db.schema.dropTable('clerkships').execute();
	await db.schema.dropTable('preceptor_availability').execute();
	await db.schema.dropTable('preceptors').execute();
	await db.schema.dropTable('students').execute();
}
