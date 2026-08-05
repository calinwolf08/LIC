import { Kysely, sql } from 'kysely';

/**
 * Site-Based Architecture Migration
 *
 * Changes:
 * - Drop preceptor_clerkships and preceptor_electives (replaced by site-based associations)
 * - Create clerkship_sites (clerkships can be at multiple sites)
 * - Create preceptor_site_clerkships (preceptor + site + clerkship three-way association)
 * - Create site_electives (electives tied to sites, not preceptors)
 * - Create site_availability and site_availability_patterns (sites have availability like preceptors)
 * - Create site_capacity_rules (sites have capacity limits)
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Drop old association tables
	await db.schema.dropTable('preceptor_clerkships').ifExists().execute();
	await db.schema.dropTable('preceptor_electives').ifExists().execute();

	// Create clerkship_sites table (many-to-many: clerkship ↔ site)
	await db.schema
		.createTable('clerkship_sites')
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('clerkship_sites_pk', ['clerkship_id', 'site_id'])
		.execute();

	await db.schema
		.createIndex('idx_clerkship_sites_clerkship')
		.on('clerkship_sites')
		.column('clerkship_id')
		.execute();

	await db.schema
		.createIndex('idx_clerkship_sites_site')
		.on('clerkship_sites')
		.column('site_id')
		.execute();

	// Create preceptor_site_clerkships table (three-way: preceptor + site + clerkship)
	// A preceptor can teach a specific clerkship at one or more sites
	await db.schema
		.createTable('preceptor_site_clerkships')
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_site_clerkships_pk', [
			'preceptor_id',
			'site_id',
			'clerkship_id'
		])
		.execute();

	await db.schema
		.createIndex('idx_preceptor_site_clerkships_preceptor')
		.on('preceptor_site_clerkships')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_site_clerkships_site')
		.on('preceptor_site_clerkships')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_site_clerkships_clerkship')
		.on('preceptor_site_clerkships')
		.column('clerkship_id')
		.execute();

	// Create site_electives table (electives are tied to sites, not preceptors)
	await db.schema
		.createTable('site_electives')
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('elective_requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('site_electives_pk', ['site_id', 'elective_requirement_id'])
		.execute();

	await db.schema
		.createIndex('idx_site_electives_site')
		.on('site_electives')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_site_electives_elective')
		.on('site_electives')
		.column('elective_requirement_id')
		.execute();

	// Create site_availability table (like preceptor_availability)
	await db.schema
		.createTable('site_availability')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
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

	await db.schema
		.createIndex('idx_site_availability_site')
		.on('site_availability')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_site_availability_date')
		.on('site_availability')
		.column('date')
		.execute();

	await db.schema
		.createIndex('idx_site_availability_site_date')
		.on('site_availability')
		.columns(['site_id', 'date'])
		.execute();

	// Create site_availability_patterns table (like preceptor_availability_patterns)
	await db.schema
		.createTable('site_availability_patterns')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('pattern_type', 'text', (col) =>
			col
				.notNull()
				.check(
					sql`pattern_type IN ('specific_dates', 'day_of_week', 'date_range', 'nth_day_of_month')`
				)
		)
		.addColumn('is_available', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('date_range_start', 'text')
		.addColumn('date_range_end', 'text')
		.addColumn('config', 'text')
		.addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('specificity', 'integer', (col) => col.notNull().defaultTo(50))
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	await db.schema
		.createIndex('idx_site_availability_patterns_site')
		.on('site_availability_patterns')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_site_availability_patterns_enabled')
		.on('site_availability_patterns')
		.column('enabled')
		.execute();

	// Create site_capacity_rules table (sites have capacity limits)
	await db.schema
		.createTable('site_capacity_rules')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.references('clerkships.id').onDelete('cascade')
		)
		.addColumn('requirement_type', 'text', (col) =>
			col.check(sql`requirement_type IN ('inpatient', 'outpatient', 'elective')`)
		)
		.addColumn('max_students_per_day', 'integer', (col) => col.notNull())
		.addColumn('max_students_per_year', 'integer', (col) => col.notNull())
		.addColumn('max_students_per_block', 'integer')
		.addColumn('max_blocks_per_year', 'integer')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	await db.schema
		.createIndex('idx_site_capacity_rules_site')
		.on('site_capacity_rules')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_site_capacity_rules_clerkship')
		.on('site_capacity_rules')
		.column('clerkship_id')
		.execute();

	await db.schema
		.createIndex('idx_site_capacity_rules_requirement_type')
		.on('site_capacity_rules')
		.column('requirement_type')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop new tables
	await db.schema.dropTable('site_capacity_rules').ifExists().execute();
	await db.schema.dropTable('site_availability_patterns').ifExists().execute();
	await db.schema.dropTable('site_availability').ifExists().execute();
	await db.schema.dropTable('site_electives').ifExists().execute();
	await db.schema.dropTable('preceptor_site_clerkships').ifExists().execute();
	await db.schema.dropTable('clerkship_sites').ifExists().execute();

	// Recreate old tables (for rollback)
	await db.schema
		.createTable('preceptor_clerkships')
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_clerkships_pk', ['preceptor_id', 'clerkship_id'])
		.execute();

	await db.schema
		.createTable('preceptor_electives')
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('elective_requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_electives_pk', [
			'preceptor_id',
			'elective_requirement_id'
		])
		.execute();
}
