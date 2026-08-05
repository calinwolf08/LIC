import { Kysely, sql } from 'kysely';

/**
 * Pattern-Based Availability Migration
 *
 * Adds support for:
 * - Scheduling periods (global time frames)
 * - Availability patterns (reusable, editable patterns)
 * - Specificity-based pattern application
 */

export async function up(db: Kysely<any>): Promise<void> {
	// ========================================
	// Scheduling Periods Table
	// ========================================
	await db.schema
		.createTable('scheduling_periods')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('start_date', 'text', (col) => col.notNull())
		.addColumn('end_date', 'text', (col) => col.notNull())
		.addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`(datetime('now'))`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`(datetime('now'))`)
		)
		.execute();

	// Ensure only one active period at a time
	await db.schema
		.createIndex('idx_scheduling_periods_active')
		.on('scheduling_periods')
		.columns(['is_active'])
		.where('is_active', '=', 1)
		.unique()
		.execute();

	// Index for date range queries
	await db.schema
		.createIndex('idx_scheduling_periods_dates')
		.on('scheduling_periods')
		.columns(['start_date', 'end_date'])
		.execute();

	// ========================================
	// Preceptor Availability Patterns Table
	// ========================================
	await db.schema
		.createTable('preceptor_availability_patterns')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('pattern_type', 'text', (col) => col.notNull().check(
			sql`pattern_type IN ('weekly', 'monthly', 'block', 'individual')`
		))
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('specificity', 'integer', (col) => col.notNull())
		.addColumn('date_range_start', 'text', (col) => col.notNull())
		.addColumn('date_range_end', 'text', (col) => col.notNull())
		.addColumn('config', 'text', (col) => col) // JSON configuration
		.addColumn('reason', 'text', (col) => col) // Optional reason for individual overrides
		.addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`(datetime('now'))`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`(datetime('now'))`)
		)
		.execute();

	// Index for preceptor lookups
	await db.schema
		.createIndex('idx_patterns_preceptor')
		.on('preceptor_availability_patterns')
		.column('preceptor_id')
		.execute();

	// Index for enabled patterns
	await db.schema
		.createIndex('idx_patterns_enabled')
		.on('preceptor_availability_patterns')
		.column('enabled')
		.execute();

	// Index for specificity ordering
	await db.schema
		.createIndex('idx_patterns_specificity')
		.on('preceptor_availability_patterns')
		.column('specificity')
		.execute();

	// Composite index for pattern application queries
	await db.schema
		.createIndex('idx_patterns_preceptor_enabled_specificity')
		.on('preceptor_availability_patterns')
		.columns(['preceptor_id', 'enabled', 'specificity'])
		.execute();

	// Index for date range queries
	await db.schema
		.createIndex('idx_patterns_dates')
		.on('preceptor_availability_patterns')
		.columns(['date_range_start', 'date_range_end'])
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop patterns table and all its indexes
	await db.schema.dropTable('preceptor_availability_patterns').execute();

	// Drop scheduling periods table and all its indexes
	await db.schema.dropTable('scheduling_periods').execute();
}
