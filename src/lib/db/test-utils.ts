/**
 * Database Test Utilities
 *
 * Utilities for creating and managing test databases in unit tests.
 */

import { Kysely, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import type { DB } from './types';

/**
 * Creates an in-memory SQLite database for testing
 */
export function createTestDatabase(): Kysely<DB> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');

	const db = new Kysely<DB>({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	return db;
}

/**
 * Cleans up and destroys a test database
 */
export async function cleanupTestDatabase(db: Kysely<DB>): Promise<void> {
	await db.destroy();
}

/**
 * Runs all migrations on a test database
 */
export async function runTestMigrations(db: Kysely<DB>): Promise<void> {
	// Import and run all migrations in order
	const { up: migration001 } = await import('./migrations/001_initial_schema');
	const { up: migration002 } = await import('./migrations/002_scheduling_configuration_schema');
	const { up: migration003 } = await import('./migrations/003_pattern_based_availability');
	const { up: migration004 } = await import('./migrations/004_clerkship_inpatient_outpatient_days');
	const { up: migration005 } = await import('./migrations/005_restructure_clerkships');
	const { up: migration006 } = await import('./migrations/006_require_preceptor_health_system');
	const { up: migration007 } = await import('./migrations/007_preceptor_associations_teams');
	const { up: migration008 } = await import('./migrations/008_student_health_system_onboarding');
	const { up: migration009 } = await import('./migrations/009_add_allow_cross_system_to_requirements');
	const { up: migration010 } = await import('./migrations/010_site_based_architecture');
	const { up: migration011 } = await import('./migrations/011_add_site_and_team_requirements');
	const { up: migration012 } = await import('./migrations/012_add_elective_available_preceptors');
	const { up: migration013 } = await import('./migrations/013_add_contact_fields');
	const { up: migration014 } = await import('./migrations/014_make_preceptor_health_system_optional');
	const { up: migration015 } = await import('./migrations/015_remove_preceptor_specialty');
	const { up: migration016 } = await import('./migrations/016_clerkship_settings_overrides');
	const { up: migration017 } = await import('./migrations/017_preceptor_multi_site');
	const { up: migration018 } = await import('./migrations/018_drop_preceptor_site_clerkships');
	const { up: migration019 } = await import('./migrations/019_site_based_availability');
	const { up: migration020 } = await import('./migrations/020_add_fallback_only_flag');
	const { up: migration021 } = await import('./migrations/021_elective_enhancements');

	await migration001(db);
	await migration002(db);
	await migration003(db);
	await migration004(db);
	await migration005(db);
	await migration006(db);
	await migration007(db);
	await migration008(db);
	await migration009(db);
	await migration010(db);
	await migration011(db);
	await migration012(db);
	await migration013(db);
	await migration014(db);
	await migration015(db);
	await migration016(db);
	await migration017(db);
	await migration018(db);
	await migration019(db);
	await migration020(db);
	await migration021(db);
}

/**
 * Creates a test database with all migrations applied
 */
export async function createTestDatabaseWithMigrations(): Promise<Kysely<DB>> {
	const db = createTestDatabase();
	await runTestMigrations(db);
	return db;
}
