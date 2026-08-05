import { Kysely, sql } from 'kysely';

/**
 * Scheduling Configuration Schema Migration
 *
 * Adds comprehensive configuration system for scheduling:
 * - Global defaults for outpatient/inpatient/elective (3 tables)
 * - Per-clerkship configuration with override tracking (4 tables)
 * - Preceptor configuration (teams, fallbacks, capacity) (4 tables)
 * - Health systems and sites (2 tables)
 * - Modifications to existing preceptors table
 *
 * Total: 13 new tables + 1 table modification
 */

export async function up(db: Kysely<any>): Promise<void> {
	// ========================================
	// Health Systems and Sites
	// ========================================

	// Health Systems table - must come first (referenced by preceptors and sites)
	await db.schema
		.createTable('health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('location', 'text')
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for name lookups
	await db.schema
		.createIndex('idx_health_systems_name')
		.on('health_systems')
		.column('name')
		.execute();

	// Sites table
	await db.schema
		.createTable('sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('health_system_id', 'text', (col) =>
			col.notNull().references('health_systems.id').onDelete('restrict')
		)
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('address', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for health system lookups
	await db.schema
		.createIndex('idx_sites_health_system')
		.on('sites')
		.column('health_system_id')
		.execute();

	// ========================================
	// Modify Preceptors Table
	// ========================================

	// Add health_system_id column
	await db.schema
		.alterTable('preceptors')
		.addColumn('health_system_id', 'text', (col) =>
			col.references('health_systems.id').onDelete('restrict')
		)
		.execute();

	// Add site_id column
	await db.schema
		.alterTable('preceptors')
		.addColumn('site_id', 'text', (col) =>
			col.references('sites.id').onDelete('set null')
		)
		.execute();

	// Index for health system filtering
	await db.schema
		.createIndex('idx_preceptors_health_system')
		.on('preceptors')
		.column('health_system_id')
		.execute();

	// Index for site filtering
	await db.schema
		.createIndex('idx_preceptors_site')
		.on('preceptors')
		.column('site_id')
		.execute();

	// ========================================
	// Global Defaults Tables
	// ========================================

	// Global Outpatient Defaults
	await db.schema
		.createTable('global_outpatient_defaults')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('school_id', 'text', (col) => col.notNull().defaultTo('default'))
		// Assignment Strategy
		.addColumn('assignment_strategy', 'text', (col) =>
			col.notNull().check(sql`assignment_strategy IN ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')`)
		)
		// Health System Rules
		.addColumn('health_system_rule', 'text', (col) =>
			col.notNull().check(sql`health_system_rule IN ('enforce_same_system', 'prefer_same_system', 'no_preference')`)
		)
		// Capacity Defaults
		.addColumn('default_max_students_per_day', 'integer', (col) =>
			col.notNull().defaultTo(1).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', 'integer', (col) =>
			col.notNull().defaultTo(3).check(sql`default_max_students_per_year > 0`)
		)
		// Team Settings
		.addColumn('allow_teams', 'integer', (col) => col.notNull().defaultTo(0)) // SQLite boolean
		.addColumn('team_size_min', 'integer', (col) => col.check(sql`team_size_min > 0 OR team_size_min IS NULL`))
		.addColumn('team_size_max', 'integer', (col) => col.check(sql`team_size_max > 0 OR team_size_max IS NULL`))
		.addColumn('team_require_same_health_system', 'integer')
		.addColumn('team_require_same_specialty', 'integer')
		// Fallback Settings
		.addColumn('allow_fallbacks', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', 'integer', (col) => col.notNull().defaultTo(0))
		// Timestamps
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint on school_id (one default per school)
	await db.schema
		.createIndex('idx_outpatient_defaults_school')
		.on('global_outpatient_defaults')
		.column('school_id')
		.unique()
		.execute();

	// Global Inpatient Defaults
	await db.schema
		.createTable('global_inpatient_defaults')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('school_id', 'text', (col) => col.notNull().defaultTo('default'))
		// Assignment Strategy
		.addColumn('assignment_strategy', 'text', (col) =>
			col.notNull().check(sql`assignment_strategy IN ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')`)
		)
		// Block Settings
		.addColumn('block_size_days', 'integer', (col) => col.check(sql`block_size_days > 0 OR block_size_days IS NULL`))
		.addColumn('allow_partial_blocks', 'integer')
		.addColumn('prefer_continuous_blocks', 'integer')
		// Health System Rules
		.addColumn('health_system_rule', 'text', (col) =>
			col.notNull().check(sql`health_system_rule IN ('enforce_same_system', 'prefer_same_system', 'no_preference')`)
		)
		// Capacity Defaults
		.addColumn('default_max_students_per_day', 'integer', (col) =>
			col.notNull().defaultTo(2).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', 'integer', (col) =>
			col.notNull().defaultTo(4).check(sql`default_max_students_per_year > 0`)
		)
		.addColumn('default_max_students_per_block', 'integer', (col) =>
			col.check(sql`default_max_students_per_block > 0 OR default_max_students_per_block IS NULL`)
		)
		.addColumn('default_max_blocks_per_year', 'integer', (col) =>
			col.check(sql`default_max_blocks_per_year > 0 OR default_max_blocks_per_year IS NULL`)
		)
		// Team Settings
		.addColumn('allow_teams', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('team_size_min', 'integer', (col) => col.check(sql`team_size_min > 0 OR team_size_min IS NULL`))
		.addColumn('team_size_max', 'integer', (col) => col.check(sql`team_size_max > 0 OR team_size_max IS NULL`))
		.addColumn('team_require_same_health_system', 'integer')
		.addColumn('team_require_same_specialty', 'integer')
		// Fallback Settings
		.addColumn('allow_fallbacks', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', 'integer', (col) => col.notNull().defaultTo(0))
		// Timestamps
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint on school_id
	await db.schema
		.createIndex('idx_inpatient_defaults_school')
		.on('global_inpatient_defaults')
		.column('school_id')
		.unique()
		.execute();

	// Global Elective Defaults
	await db.schema
		.createTable('global_elective_defaults')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('school_id', 'text', (col) => col.notNull().defaultTo('default'))
		// Assignment Strategy
		.addColumn('assignment_strategy', 'text', (col) =>
			col.notNull().check(sql`assignment_strategy IN ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')`)
		)
		// Health System Rules
		.addColumn('health_system_rule', 'text', (col) =>
			col.notNull().check(sql`health_system_rule IN ('enforce_same_system', 'prefer_same_system', 'no_preference')`)
		)
		// Capacity Defaults
		.addColumn('default_max_students_per_day', 'integer', (col) =>
			col.notNull().defaultTo(2).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', 'integer', (col) =>
			col.notNull().defaultTo(10).check(sql`default_max_students_per_year > 0`)
		)
		// Team Settings (simpler for electives)
		.addColumn('allow_teams', 'integer', (col) => col.notNull().defaultTo(0))
		// Fallback Settings (more permissive for electives)
		.addColumn('allow_fallbacks', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', 'integer', (col) => col.notNull().defaultTo(1))
		// Timestamps
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint on school_id
	await db.schema
		.createIndex('idx_elective_defaults_school')
		.on('global_elective_defaults')
		.column('school_id')
		.unique()
		.execute();

	// ========================================
	// Per-Clerkship Configuration Tables
	// ========================================

	// Clerkship Configurations (lightweight parent table)
	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().unique().references('clerkships.id').onDelete('cascade')
		)
		// Metadata
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for clerkship lookups
	await db.schema
		.createIndex('idx_clerkship_configs_clerkship')
		.on('clerkship_configurations')
		.column('clerkship_id')
		.unique()
		.execute();

	// Clerkship Requirements (per-requirement-type settings with overrides)
	await db.schema
		.createTable('clerkship_requirements')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('requirement_type', 'text', (col) =>
			col.notNull().check(sql`requirement_type IN ('outpatient', 'inpatient', 'elective')`)
		)
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		// Override Control
		.addColumn('override_mode', 'text', (col) =>
			col.notNull().defaultTo('inherit').check(sql`override_mode IN ('inherit', 'override_fields', 'override_section')`)
		)
		// Override Values (only used if override_mode != 'inherit')
		.addColumn('override_assignment_strategy', 'text', (col) =>
			col.check(sql`override_assignment_strategy IN ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation') OR override_assignment_strategy IS NULL`)
		)
		.addColumn('override_health_system_rule', 'text', (col) =>
			col.check(sql`override_health_system_rule IN ('enforce_same_system', 'prefer_same_system', 'no_preference') OR override_health_system_rule IS NULL`)
		)
		.addColumn('override_max_students_per_day', 'integer', (col) =>
			col.check(sql`override_max_students_per_day > 0 OR override_max_students_per_day IS NULL`)
		)
		.addColumn('override_max_students_per_year', 'integer', (col) =>
			col.check(sql`override_max_students_per_year > 0 OR override_max_students_per_year IS NULL`)
		)
		.addColumn('override_max_students_per_block', 'integer', (col) =>
			col.check(sql`override_max_students_per_block > 0 OR override_max_students_per_block IS NULL`)
		)
		.addColumn('override_max_blocks_per_year', 'integer', (col) =>
			col.check(sql`override_max_blocks_per_year > 0 OR override_max_blocks_per_year IS NULL`)
		)
		.addColumn('override_block_size_days', 'integer', (col) =>
			col.check(sql`override_block_size_days > 0 OR override_block_size_days IS NULL`)
		)
		.addColumn('override_allow_partial_blocks', 'integer')
		.addColumn('override_prefer_continuous_blocks', 'integer')
		.addColumn('override_allow_teams', 'integer')
		.addColumn('override_allow_fallbacks', 'integer')
		.addColumn('override_fallback_requires_approval', 'integer')
		.addColumn('override_fallback_allow_cross_system', 'integer')
		// Timestamps
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint: one requirement per type per clerkship
	await db.schema
		.createIndex('idx_requirements_clerkship_type')
		.on('clerkship_requirements')
		.columns(['clerkship_id', 'requirement_type'])
		.unique()
		.execute();

	// Index for clerkship lookups
	await db.schema
		.createIndex('idx_requirements_clerkship')
		.on('clerkship_requirements')
		.column('clerkship_id')
		.execute();

	// Clerkship Requirement Overrides (field-level tracking)
	await db.schema
		.createTable('clerkship_requirement_overrides')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('field_name', 'text', (col) => col.notNull())
		.addColumn('is_overridden', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint: one override per field per requirement
	await db.schema
		.createIndex('idx_overrides_requirement_field')
		.on('clerkship_requirement_overrides')
		.columns(['requirement_id', 'field_name'])
		.unique()
		.execute();

	// Clerkship Electives
	await db.schema
		.createTable('clerkship_electives')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('minimum_days', 'integer', (col) =>
			col.notNull().check(sql`minimum_days > 0`)
		)
		.addColumn('specialty', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for requirement lookups
	await db.schema
		.createIndex('idx_electives_requirement')
		.on('clerkship_electives')
		.column('requirement_id')
		.execute();

	// ========================================
	// Preceptor Configuration Tables
	// ========================================

	// Preceptor Teams
	await db.schema
		.createTable('preceptor_teams')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('name', 'text')
		.addColumn('require_same_health_system', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_site', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_specialty', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('requires_admin_approval', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for clerkship lookups
	await db.schema
		.createIndex('idx_teams_clerkship')
		.on('preceptor_teams')
		.column('clerkship_id')
		.execute();

	// Preceptor Team Members (junction table)
	await db.schema
		.createTable('preceptor_team_members')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('team_id', 'text', (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('role', 'text')
		.addColumn('priority', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Unique constraint: preceptor can only be in team once
	await db.schema
		.createIndex('idx_team_members_team_preceptor')
		.on('preceptor_team_members')
		.columns(['team_id', 'preceptor_id'])
		.unique()
		.execute();

	// Index for preceptor lookups
	await db.schema
		.createIndex('idx_team_members_preceptor')
		.on('preceptor_team_members')
		.column('preceptor_id')
		.execute();

	// Preceptor Fallbacks
	await db.schema
		.createTable('preceptor_fallbacks')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('primary_preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('fallback_preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.references('clerkships.id').onDelete('cascade')
		)
		.addColumn('priority', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('requires_approval', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('allow_different_health_system', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for primary preceptor lookups
	await db.schema
		.createIndex('idx_fallbacks_primary')
		.on('preceptor_fallbacks')
		.column('primary_preceptor_id')
		.execute();

	// Index for clerkship-specific fallbacks
	await db.schema
		.createIndex('idx_fallbacks_primary_clerkship')
		.on('preceptor_fallbacks')
		.columns(['primary_preceptor_id', 'clerkship_id'])
		.execute();

	// Preceptor Capacity Rules (hierarchical)
	await db.schema
		.createTable('preceptor_capacity_rules')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.references('clerkships.id').onDelete('cascade')
		)
		.addColumn('requirement_type', 'text', (col) =>
			col.check(sql`requirement_type IN ('outpatient', 'inpatient', 'elective') OR requirement_type IS NULL`)
		)
		.addColumn('max_students_per_day', 'integer', (col) =>
			col.notNull().check(sql`max_students_per_day > 0`)
		)
		.addColumn('max_students_per_year', 'integer', (col) =>
			col.notNull().check(sql`max_students_per_year > 0`)
		)
		.addColumn('max_students_per_block', 'integer', (col) =>
			col.check(sql`max_students_per_block > 0 OR max_students_per_block IS NULL`)
		)
		.addColumn('max_blocks_per_year', 'integer', (col) =>
			col.check(sql`max_blocks_per_year > 0 OR max_blocks_per_year IS NULL`)
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Index for preceptor lookups
	await db.schema
		.createIndex('idx_capacity_preceptor')
		.on('preceptor_capacity_rules')
		.column('preceptor_id')
		.execute();

	// Index for hierarchy resolution (preceptor + clerkship + requirement_type)
	await db.schema
		.createIndex('idx_capacity_hierarchy')
		.on('preceptor_capacity_rules')
		.columns(['preceptor_id', 'clerkship_id', 'requirement_type'])
		.execute();

	// ========================================
	// Insert Default Global Defaults
	// ========================================

	// Insert default outpatient defaults
	await db
		.insertInto('global_outpatient_defaults')
		.values({
			id: 'default-outpatient',
			school_id: 'default',
			assignment_strategy: 'continuous_single',
			health_system_rule: 'enforce_same_system',
			default_max_students_per_day: 1,
			default_max_students_per_year: 3,
			allow_teams: 0,
			allow_fallbacks: 1,
			fallback_requires_approval: 0,
			fallback_allow_cross_system: 0,
		})
		.execute();

	// Insert default inpatient defaults
	await db
		.insertInto('global_inpatient_defaults')
		.values({
			id: 'default-inpatient',
			school_id: 'default',
			assignment_strategy: 'block_based',
			block_size_days: 14,
			allow_partial_blocks: 1,
			prefer_continuous_blocks: 1,
			health_system_rule: 'prefer_same_system',
			default_max_students_per_day: 2,
			default_max_students_per_year: 4,
			default_max_students_per_block: 1,
			default_max_blocks_per_year: 4,
			allow_teams: 0,
			allow_fallbacks: 1,
			fallback_requires_approval: 0,
			fallback_allow_cross_system: 0,
		})
		.execute();

	// Insert default elective defaults
	await db
		.insertInto('global_elective_defaults')
		.values({
			id: 'default-elective',
			school_id: 'default',
			assignment_strategy: 'daily_rotation',
			health_system_rule: 'no_preference',
			default_max_students_per_day: 2,
			default_max_students_per_year: 10,
			allow_teams: 0,
			allow_fallbacks: 1,
			fallback_requires_approval: 0,
			fallback_allow_cross_system: 1,
		})
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop tables in reverse order to handle foreign key dependencies
	await db.schema.dropTable('preceptor_capacity_rules').execute();
	await db.schema.dropTable('preceptor_fallbacks').execute();
	await db.schema.dropTable('preceptor_team_members').execute();
	await db.schema.dropTable('preceptor_teams').execute();
	await db.schema.dropTable('clerkship_electives').execute();
	await db.schema.dropTable('clerkship_requirement_overrides').execute();
	await db.schema.dropTable('clerkship_requirements').execute();
	await db.schema.dropTable('clerkship_configurations').execute();
	await db.schema.dropTable('global_elective_defaults').execute();
	await db.schema.dropTable('global_inpatient_defaults').execute();
	await db.schema.dropTable('global_outpatient_defaults').execute();

	// Remove columns from preceptors table
	// SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
	// For simplicity in down migration, we'll skip this (or implement full table recreation)

	await db.schema.dropTable('sites').execute();
	await db.schema.dropTable('health_systems').execute();
}
