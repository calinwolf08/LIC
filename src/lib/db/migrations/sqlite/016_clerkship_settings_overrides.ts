import { Kysely, sql } from 'kysely';

/**
 * Migration 016: Clerkship Settings Overrides
 *
 * Expands clerkship_configurations table to support clerkship-level settings
 * that can override global defaults. This allows each clerkship to customize
 * scheduling settings without using the requirements system.
 *
 * Changes:
 * - Add override_mode column ('inherit' or 'override')
 * - Add override columns for all scheduling settings
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Add override_mode column with default 'inherit'
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_mode', 'text', (col) => col.defaultTo('inherit'))
		.execute();

	// Assignment settings
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_assignment_strategy', 'text')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_health_system_rule', 'text')
		.execute();

	// Capacity settings
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_max_students_per_day', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_max_students_per_year', 'integer')
		.execute();

	// Inpatient-specific settings
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_block_size_days', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_max_students_per_block', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_max_blocks_per_year', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_allow_partial_blocks', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_prefer_continuous_blocks', 'integer')
		.execute();

	// Team settings
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_allow_teams', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_team_size_min', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_team_size_max', 'integer')
		.execute();

	// Fallback settings
	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_allow_fallbacks', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_fallback_requires_approval', 'integer')
		.execute();

	await db.schema
		.alterTable('clerkship_configurations')
		.addColumn('override_fallback_allow_cross_system', 'integer')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support DROP COLUMN in older versions
	// For a proper rollback, would need to recreate the table
	// For now, this is a placeholder that won't work on older SQLite
	const columns = [
		'override_mode',
		'override_assignment_strategy',
		'override_health_system_rule',
		'override_max_students_per_day',
		'override_max_students_per_year',
		'override_block_size_days',
		'override_max_students_per_block',
		'override_max_blocks_per_year',
		'override_allow_partial_blocks',
		'override_prefer_continuous_blocks',
		'override_allow_teams',
		'override_team_size_min',
		'override_team_size_max',
		'override_allow_fallbacks',
		'override_fallback_requires_approval',
		'override_fallback_allow_cross_system'
	];

	for (const column of columns) {
		try {
			await db.schema.alterTable('clerkship_configurations').dropColumn(column).execute();
		} catch {
			// Column might not exist or SQLite version doesn't support DROP COLUMN
		}
	}
}
