/**
 * Postgres baseline — the final state of the SQLite 001..027 history, created
 * directly.
 *
 * WHY A BASELINE INSTEAD OF REPLAYING THE HISTORY: three of the 27 SQLite
 * migrations are irreducibly SQLite-specific — 003 defaults a column to
 * `datetime('now')`, and 014/015 perform the SQLite 12-step table rebuild
 * behind `PRAGMA foreign_keys = OFF`. Rewriting them portably would change the
 * files whose names are the primary key of `kysely_migration` in every existing
 * SQLite database. Postgres has no history to preserve (it starts empty), so it
 * gets the end state in one shot instead.
 *
 * HOW IT WAS DERIVED: by running all 27 migrations against SQLite and reading
 * back `sqlite_master`, not by hand from the models. The equivalence test
 * (`../migrations.equivalence.test.ts`) re-runs that comparison on every CI run,
 * so this file cannot drift from the SQLite schema unnoticed.
 *
 * TRANSLATION RULES (see DdlTypeMap in ../../dialects/types.ts):
 *   - 0/1 flags stay `integer`. A real Postgres `boolean` would come back as
 *     true/false and break the ~19 `x === 1` comparisons across the app.
 *   - Timestamps stay `text` holding ISO-8601-ish strings, compared and sorted
 *     lexicographically. `timestamptz` would return Date objects.
 *   - SQLite's `CURRENT_TIMESTAMP` / `datetime('now')` both yield
 *     'YYYY-MM-DD HH:MM:SS' in UTC. `nowText()` below reproduces that exact
 *     format on Postgres; `now()` alone would produce a timestamp, and casting
 *     it to text would add a timezone offset and fractional seconds.
 *
 * Everything after this file is written once, portably, in ../shared/.
 */

import { sql } from 'kysely';
import type { Kysely } from 'kysely';

// A migration must import ONLY from 'kysely'. Kysely's FileMigrationProvider
// loads migration files by absolute path, and Vitest's module runner cannot
// resolve a so-loaded file's relative cross-tree imports (production tsx can,
// but the test lane must too). So the portable column types and the
// introspection guards are inlined here rather than pulled from the dialect
// registry / helpers module.
//
// App tables keep the SQLite convention on Postgres too — integer 0/1 booleans
// and ISO-8601 text timestamps — so the schema (and the generated types.ts) is
// identical across engines and no application code changes. better-auth's OWN
// tables are the only ones using native Postgres boolean/timestamptz; those are
// created separately by ensureAuthTables, not here.
const TEXT = sql.raw('text');
const INTEGER = sql.raw('integer');
/** 0/1 in an integer column — deliberately NOT a Postgres boolean. */
const BOOLEAN = sql.raw('integer');
/** ISO-8601 text — deliberately NOT a Postgres timestamp. */
const TIMESTAMP = sql.raw('text');

/** True when `table` exists (introspection works on every engine). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tableExists(db: Kysely<any>, table: string): Promise<boolean> {
	const tables = await db.introspection.getTables();
	return tables.some((t) => t.name === table);
}

/** True when `table` exists AND has `column`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
	const tables = await db.introspection.getTables();
	return tables.find((t) => t.name === table)?.columns.some((c) => c.name === column) ?? false;
}

/** Byte-identical to SQLite's CURRENT_TIMESTAMP: 'YYYY-MM-DD HH:MM:SS' in UTC. */
const nowText = () => sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

export async function up(db: Kysely<any>): Promise<void> {
	// ---------------------------------------------------------------- roots

	await db.schema
		.createTable('health_systems')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('location', TEXT)
		.addColumn('description', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('clerkships')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull().unique())
		.addColumn('specialty', TEXT)
		.addColumn('clerkship_type', TEXT, (col) =>
			col.notNull().check(sql`clerkship_type IN ('inpatient', 'outpatient')`)
		)
		.addColumn('required_days', INTEGER, (col) => col.notNull().check(sql`required_days > 0`))
		.addColumn('description', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('students')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('email', TEXT, (col) => col.notNull().unique())
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('sites')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('health_system_id', TEXT, (col) =>
			col.notNull().references('health_systems.id').onDelete('restrict')
		)
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('address', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('office_phone', TEXT)
		.addColumn('contact_person', TEXT)
		.addColumn('contact_email', TEXT)
		.execute();

	await db.schema
		.createTable('teams')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('health_system_id', TEXT, (col) =>
			col.notNull().references('health_systems.id').onDelete('restrict')
		)
		.addColumn('description', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// `health_system_id` carries no foreign key: migration 014 rebuilt this table
	// to make the health system optional and dropped the constraint with it.
	await db.schema
		.createTable('preceptors')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('email', TEXT, (col) => col.notNull())
		.addColumn('phone', TEXT)
		.addColumn('health_system_id', TEXT)
		.addColumn('max_students', INTEGER, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		// Nullable with a default — migration 020 added it via ALTER TABLE.
		.addColumn('is_global_fallback_only', BOOLEAN, (col) => col.defaultTo(0))
		.execute();

	await db.schema
		.createTable('blackout_dates')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('date', TEXT, (col) => col.notNull().unique())
		.addColumn('reason', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// created_at/updated_at defaulted to `datetime('now')` here rather than
	// CURRENT_TIMESTAMP in the SQLite history (migration 003); both produce the
	// same string, so both map to the same Postgres expression.
	await db.schema
		.createTable('scheduling_periods')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('start_date', TEXT, (col) => col.notNull())
		.addColumn('end_date', TEXT, (col) => col.notNull())
		.addColumn('is_active', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('year', INTEGER)
		// No foreign key to `user`: that table belongs to better-auth and may not
		// exist when migrations run. Enforced in the application layer, exactly as
		// on SQLite (migration 023).
		.addColumn('user_id', TEXT)
		.execute();

	// ------------------------------------------------- clerkship configuration

	await db.schema
		.createTable('clerkship_configurations')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().unique().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('override_mode', TEXT, (col) => col.defaultTo('inherit'))
		.addColumn('override_assignment_strategy', TEXT)
		.addColumn('override_health_system_rule', TEXT)
		.addColumn('override_max_students_per_day', INTEGER)
		.addColumn('override_max_students_per_year', INTEGER)
		.addColumn('override_block_size_days', INTEGER)
		.addColumn('override_max_students_per_block', INTEGER)
		.addColumn('override_max_blocks_per_year', INTEGER)
		.addColumn('override_allow_partial_blocks', BOOLEAN)
		.addColumn('override_prefer_continuous_blocks', BOOLEAN)
		.addColumn('override_allow_teams', BOOLEAN)
		.addColumn('override_team_size_min', INTEGER)
		.addColumn('override_team_size_max', INTEGER)
		.addColumn('override_allow_fallbacks', BOOLEAN)
		.addColumn('override_fallback_requires_approval', BOOLEAN)
		.addColumn('override_fallback_allow_cross_system', BOOLEAN)
		.execute();

	await db.schema
		.createTable('clerkship_electives')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('name', TEXT, (col) => col.notNull())
		.addColumn('minimum_days', INTEGER, (col) => col.notNull().check(sql`minimum_days > 0`))
		.addColumn('specialty', TEXT)
		.addColumn('is_required', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('override_mode', TEXT, (col) =>
			col
				.notNull()
				.defaultTo('inherit')
				.check(sql`override_mode IN ('inherit', 'override')`)
		)
		.addColumn('override_assignment_strategy', TEXT)
		.addColumn('override_health_system_rule', TEXT)
		.addColumn('override_max_students_per_day', INTEGER)
		.addColumn('override_max_students_per_year', INTEGER)
		.addColumn('override_allow_fallbacks', BOOLEAN)
		.addColumn('override_allow_teams', BOOLEAN)
		.addColumn('override_fallback_requires_approval', BOOLEAN)
		.addColumn('override_fallback_allow_cross_system', BOOLEAN)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('clerkship_sites')
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addPrimaryKeyConstraint('clerkship_sites_pk', ['clerkship_id', 'site_id'])
		.execute();

	await db.schema
		.createTable('elective_preceptors')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('elective_id', TEXT, (col) =>
			col.notNull().references('clerkship_electives.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('elective_sites')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('elective_id', TEXT, (col) =>
			col.notNull().references('clerkship_electives.id').onDelete('cascade')
		)
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// ------------------------------------------------------- global defaults

	const assignmentStrategy = sql`assignment_strategy IN ('continuous_single', 'continuous_team', 'block_based', 'daily_rotation')`;
	const healthSystemRule = sql`health_system_rule IN ('enforce_same_system', 'prefer_same_system', 'no_preference')`;

	await db.schema
		.createTable('global_inpatient_defaults')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('school_id', TEXT, (col) => col.notNull().defaultTo('default'))
		.addColumn('assignment_strategy', TEXT, (col) => col.notNull().check(assignmentStrategy))
		.addColumn('block_size_days', INTEGER, (col) =>
			col.check(sql`block_size_days > 0 OR block_size_days IS NULL`)
		)
		.addColumn('allow_partial_blocks', BOOLEAN)
		.addColumn('prefer_continuous_blocks', BOOLEAN)
		.addColumn('health_system_rule', TEXT, (col) => col.notNull().check(healthSystemRule))
		.addColumn('default_max_students_per_day', INTEGER, (col) =>
			col.notNull().defaultTo(2).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', INTEGER, (col) =>
			col.notNull().defaultTo(4).check(sql`default_max_students_per_year > 0`)
		)
		.addColumn('default_max_students_per_block', INTEGER, (col) =>
			col.check(sql`default_max_students_per_block > 0 OR default_max_students_per_block IS NULL`)
		)
		.addColumn('default_max_blocks_per_year', INTEGER, (col) =>
			col.check(sql`default_max_blocks_per_year > 0 OR default_max_blocks_per_year IS NULL`)
		)
		.addColumn('allow_teams', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('team_size_min', INTEGER, (col) =>
			col.check(sql`team_size_min > 0 OR team_size_min IS NULL`)
		)
		.addColumn('team_size_max', INTEGER, (col) =>
			col.check(sql`team_size_max > 0 OR team_size_max IS NULL`)
		)
		.addColumn('team_require_same_health_system', BOOLEAN)
		.addColumn('team_require_same_specialty', BOOLEAN)
		.addColumn('allow_fallbacks', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('global_outpatient_defaults')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('school_id', TEXT, (col) => col.notNull().defaultTo('default'))
		.addColumn('assignment_strategy', TEXT, (col) => col.notNull().check(assignmentStrategy))
		.addColumn('health_system_rule', TEXT, (col) => col.notNull().check(healthSystemRule))
		.addColumn('default_max_students_per_day', INTEGER, (col) =>
			col.notNull().defaultTo(1).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', INTEGER, (col) =>
			col.notNull().defaultTo(3).check(sql`default_max_students_per_year > 0`)
		)
		.addColumn('allow_teams', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('team_size_min', INTEGER, (col) =>
			col.check(sql`team_size_min > 0 OR team_size_min IS NULL`)
		)
		.addColumn('team_size_max', INTEGER, (col) =>
			col.check(sql`team_size_max > 0 OR team_size_max IS NULL`)
		)
		.addColumn('team_require_same_health_system', BOOLEAN)
		.addColumn('team_require_same_specialty', BOOLEAN)
		.addColumn('allow_fallbacks', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('global_elective_defaults')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('school_id', TEXT, (col) => col.notNull().defaultTo('default'))
		.addColumn('assignment_strategy', TEXT, (col) => col.notNull().check(assignmentStrategy))
		.addColumn('health_system_rule', TEXT, (col) => col.notNull().check(healthSystemRule))
		.addColumn('default_max_students_per_day', INTEGER, (col) =>
			col.notNull().defaultTo(2).check(sql`default_max_students_per_day > 0`)
		)
		.addColumn('default_max_students_per_year', INTEGER, (col) =>
			col.notNull().defaultTo(10).check(sql`default_max_students_per_year > 0`)
		)
		.addColumn('allow_teams', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('allow_fallbacks', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('fallback_requires_approval', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('fallback_allow_cross_system', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// ------------------------------------------------- preceptor capabilities

	// No foreign keys: migration 019 rebuilt these two tables around site-based
	// availability and did not restore them.
	await db.schema
		.createTable('preceptor_availability')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('preceptor_id', TEXT, (col) => col.notNull())
		.addColumn('site_id', TEXT, (col) => col.notNull())
		.addColumn('date', TEXT, (col) => col.notNull())
		.addColumn('is_available', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('preceptor_availability_patterns')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('preceptor_id', TEXT, (col) => col.notNull())
		.addColumn('site_id', TEXT, (col) => col.notNull())
		.addColumn('pattern_type', TEXT, (col) => col.notNull())
		.addColumn('config', TEXT)
		.addColumn('date_range_start', TEXT, (col) => col.notNull())
		.addColumn('date_range_end', TEXT, (col) => col.notNull())
		.addColumn('is_available', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('reason', TEXT)
		.addColumn('specificity', INTEGER, (col) => col.notNull().defaultTo(0))
		.addColumn('enabled', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('preceptor_capacity_rules')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', TEXT, (col) => col.references('clerkships.id').onDelete('cascade'))
		.addColumn('requirement_type', TEXT, (col) =>
			col.check(
				sql`requirement_type IN ('outpatient', 'inpatient', 'elective') OR requirement_type IS NULL`
			)
		)
		.addColumn('max_students_per_day', INTEGER, (col) =>
			col.notNull().check(sql`max_students_per_day > 0`)
		)
		.addColumn('max_students_per_year', INTEGER, (col) =>
			col.notNull().check(sql`max_students_per_year > 0`)
		)
		.addColumn('max_students_per_block', INTEGER, (col) =>
			col.check(sql`max_students_per_block > 0 OR max_students_per_block IS NULL`)
		)
		.addColumn('max_blocks_per_year', INTEGER, (col) =>
			col.check(sql`max_blocks_per_year > 0 OR max_blocks_per_year IS NULL`)
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('preceptor_fallbacks')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('primary_preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('fallback_preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', TEXT, (col) => col.references('clerkships.id').onDelete('cascade'))
		.addColumn('priority', INTEGER, (col) => col.notNull().defaultTo(1))
		.addColumn('requires_approval', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('allow_different_health_system', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('preceptor_sites')
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addPrimaryKeyConstraint('pk_preceptor_sites', ['preceptor_id', 'site_id'])
		.execute();

	await db.schema
		.createTable('preceptor_teams')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('name', TEXT)
		.addColumn('require_same_health_system', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_site', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_specialty', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('requires_admin_approval', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('preceptor_team_members')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('team_id', TEXT, (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('role', TEXT)
		.addColumn('priority', INTEGER, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		// Nullable with a default — migration 020 added it via ALTER TABLE.
		.addColumn('is_fallback_only', BOOLEAN, (col) => col.defaultTo(0))
		.execute();

	await db.schema
		.createTable('team_sites')
		.addColumn('team_id', TEXT, (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addPrimaryKeyConstraint('pk_team_sites', ['team_id', 'site_id'])
		.execute();

	// --------------------------------------------------------------- sites

	await db.schema
		.createTable('site_availability')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('date', TEXT, (col) => col.notNull())
		.addColumn('is_available', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	await db.schema
		.createTable('site_availability_patterns')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('pattern_type', TEXT, (col) =>
			col
				.notNull()
				.check(
					sql`pattern_type IN ('specific_dates', 'day_of_week', 'date_range', 'nth_day_of_month')`
				)
		)
		.addColumn('is_available', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('date_range_start', TEXT)
		.addColumn('date_range_end', TEXT)
		.addColumn('config', TEXT)
		.addColumn('enabled', BOOLEAN, (col) => col.notNull().defaultTo(1))
		.addColumn('specificity', INTEGER, (col) => col.notNull().defaultTo(50))
		.addColumn('reason', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// The requirement_type check has no explicit `IS NULL` arm and does not need
	// one: a CHECK that evaluates to NULL passes on both engines.
	await db.schema
		.createTable('site_capacity_rules')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('clerkship_id', TEXT, (col) => col.references('clerkships.id').onDelete('cascade'))
		.addColumn('requirement_type', TEXT, (col) =>
			col.check(sql`requirement_type IN ('inpatient', 'outpatient', 'elective')`)
		)
		.addColumn('max_students_per_day', INTEGER, (col) => col.notNull())
		.addColumn('max_students_per_year', INTEGER, (col) => col.notNull())
		.addColumn('max_students_per_block', INTEGER)
		.addColumn('max_blocks_per_year', INTEGER)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// ------------------------------------------------------------- students

	await db.schema
		.createTable('student_health_system_onboarding')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('student_id', TEXT, (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('health_system_id', TEXT, (col) =>
			col.notNull().references('health_systems.id').onDelete('cascade')
		)
		.addColumn('is_completed', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('completed_date', TEXT)
		.addColumn('notes', TEXT)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.execute();

	// ---------------------------------------------------------- assignments

	// `site_id` has no foreign key on SQLite either — migration 010 added it with
	// ALTER TABLE, which cannot attach a constraint in SQLite.
	await db.schema
		.createTable('schedule_assignments')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('student_id', TEXT, (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('restrict')
		)
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().references('clerkships.id').onDelete('restrict')
		)
		.addColumn('date', TEXT, (col) => col.notNull())
		.addColumn('status', TEXT, (col) => col.notNull().defaultTo('scheduled'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('updated_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addColumn('site_id', TEXT)
		.addColumn('elective_id', TEXT, (col) =>
			col.references('clerkship_electives.id').onDelete('set null')
		)
		.addColumn('locked', BOOLEAN, (col) => col.notNull().defaultTo(0))
		.addColumn('source', TEXT, (col) => col.notNull().defaultTo('manual'))
		.addColumn('override_codes', TEXT, (col) => col.notNull().defaultTo('[]'))
		.addColumn('override_note', TEXT)
		.execute();

	// ------------------------------------------------------ schedule scoping

	await db.schema
		.createTable('schedule_clerkships')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', TEXT, (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_clerkships_unique', ['schedule_id', 'clerkship_id'])
		.execute();

	await db.schema
		.createTable('schedule_configurations')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('configuration_id', TEXT, (col) =>
			col.notNull().references('clerkship_configurations.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_configurations_unique', ['schedule_id', 'configuration_id'])
		.execute();

	await db.schema
		.createTable('schedule_health_systems')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('health_system_id', TEXT, (col) =>
			col.notNull().references('health_systems.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_health_systems_unique', ['schedule_id', 'health_system_id'])
		.execute();

	await db.schema
		.createTable('schedule_preceptors')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', TEXT, (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_preceptors_unique', ['schedule_id', 'preceptor_id'])
		.execute();

	await db.schema
		.createTable('schedule_sites')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('site_id', TEXT, (col) => col.notNull().references('sites.id').onDelete('cascade'))
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_sites_unique', ['schedule_id', 'site_id'])
		.execute();

	await db.schema
		.createTable('schedule_students')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('student_id', TEXT, (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_students_unique', ['schedule_id', 'student_id'])
		.execute();

	await db.schema
		.createTable('schedule_teams')
		.addColumn('id', TEXT, (col) => col.primaryKey())
		.addColumn('schedule_id', TEXT, (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('team_id', TEXT, (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('created_at', TIMESTAMP, (col) => col.notNull().defaultTo(nowText()))
		.addUniqueConstraint('schedule_teams_unique', ['schedule_id', 'team_id'])
		.execute();

	// ------------------------------------------------------------- indexes
	// Same names as SQLite so a schema diff between the two engines is empty.

	const index = (name: string, table: string, columns: string[]) =>
		db.schema.createIndex(name).on(table).columns(columns).execute();

	const uniqueIndex = (name: string, table: string, columns: string[]) =>
		db.schema.createIndex(name).unique().on(table).columns(columns).execute();

	await uniqueIndex('idx_blackout_dates_date', 'blackout_dates', ['date']);

	await uniqueIndex('idx_clerkship_configs_clerkship', 'clerkship_configurations', ['clerkship_id']);

	await index('idx_electives_clerkship', 'clerkship_electives', ['clerkship_id']);

	await index('idx_clerkship_sites_clerkship', 'clerkship_sites', ['clerkship_id']);
	await index('idx_clerkship_sites_site', 'clerkship_sites', ['site_id']);

	await index('idx_clerkships_specialty', 'clerkships', ['specialty']);
	await index('idx_clerkships_type', 'clerkships', ['clerkship_type']);

	await index('idx_elective_preceptors_elective', 'elective_preceptors', ['elective_id']);
	await index('idx_elective_preceptors_preceptor', 'elective_preceptors', ['preceptor_id']);
	await uniqueIndex('idx_elective_preceptors_unique', 'elective_preceptors', [
		'elective_id',
		'preceptor_id',
	]);

	await index('idx_elective_sites_elective', 'elective_sites', ['elective_id']);
	await index('idx_elective_sites_site', 'elective_sites', ['site_id']);
	await uniqueIndex('idx_elective_sites_unique', 'elective_sites', ['elective_id', 'site_id']);

	await uniqueIndex('idx_elective_defaults_school', 'global_elective_defaults', ['school_id']);
	await uniqueIndex('idx_inpatient_defaults_school', 'global_inpatient_defaults', ['school_id']);
	await uniqueIndex('idx_outpatient_defaults_school', 'global_outpatient_defaults', ['school_id']);

	await index('idx_health_systems_name', 'health_systems', ['name']);

	await index('idx_preceptor_availability_date', 'preceptor_availability', ['date']);
	await index('idx_preceptor_availability_preceptor', 'preceptor_availability', ['preceptor_id']);
	await index('idx_preceptor_availability_site', 'preceptor_availability', ['site_id']);
	await uniqueIndex('idx_preceptor_availability_unique', 'preceptor_availability', [
		'preceptor_id',
		'site_id',
		'date',
	]);

	await index('idx_preceptor_availability_patterns_preceptor', 'preceptor_availability_patterns', [
		'preceptor_id',
	]);
	await index('idx_preceptor_availability_patterns_site', 'preceptor_availability_patterns', [
		'site_id',
	]);

	await index('idx_capacity_hierarchy', 'preceptor_capacity_rules', [
		'preceptor_id',
		'clerkship_id',
		'requirement_type',
	]);
	await index('idx_capacity_preceptor', 'preceptor_capacity_rules', ['preceptor_id']);

	await index('idx_fallbacks_primary', 'preceptor_fallbacks', ['primary_preceptor_id']);
	await index('idx_fallbacks_primary_clerkship', 'preceptor_fallbacks', [
		'primary_preceptor_id',
		'clerkship_id',
	]);

	await index('idx_preceptor_sites_preceptor', 'preceptor_sites', ['preceptor_id']);
	await index('idx_preceptor_sites_site', 'preceptor_sites', ['site_id']);

	await index('idx_team_members_preceptor', 'preceptor_team_members', ['preceptor_id']);
	await uniqueIndex('idx_team_members_team_preceptor', 'preceptor_team_members', [
		'team_id',
		'preceptor_id',
	]);

	await index('idx_teams_clerkship', 'preceptor_teams', ['clerkship_id']);

	await index('idx_assignments_clerkship', 'schedule_assignments', ['clerkship_id']);
	await index('idx_assignments_date', 'schedule_assignments', ['date']);
	await index('idx_assignments_elective', 'schedule_assignments', ['elective_id']);
	await index('idx_assignments_preceptor_date', 'schedule_assignments', ['preceptor_id', 'date']);
	await uniqueIndex('idx_assignments_student_date', 'schedule_assignments', ['student_id', 'date']);
	await index('idx_schedule_assignments_site', 'schedule_assignments', ['site_id']);

	await index('idx_schedule_clerkships_schedule', 'schedule_clerkships', ['schedule_id']);
	await index('idx_schedule_configurations_schedule', 'schedule_configurations', ['schedule_id']);
	await index('idx_schedule_health_systems_schedule', 'schedule_health_systems', ['schedule_id']);
	await index('idx_schedule_preceptors_preceptor', 'schedule_preceptors', ['preceptor_id']);
	await index('idx_schedule_preceptors_schedule', 'schedule_preceptors', ['schedule_id']);
	await index('idx_schedule_sites_schedule', 'schedule_sites', ['schedule_id']);
	await index('idx_schedule_students_schedule', 'schedule_students', ['schedule_id']);
	await index('idx_schedule_students_student', 'schedule_students', ['student_id']);
	await index('idx_schedule_teams_schedule', 'schedule_teams', ['schedule_id']);

	// Partial unique index: at most one active schedule. Postgres and SQLite
	// both support `WHERE` on an index; this is what enforces the invariant.
	await db.schema
		.createIndex('idx_scheduling_periods_active')
		.unique()
		.on('scheduling_periods')
		.column('is_active')
		.where(sql.ref('is_active'), '=', 1)
		.execute();
	await index('idx_scheduling_periods_dates', 'scheduling_periods', ['start_date', 'end_date']);
	await index('idx_scheduling_periods_user_id', 'scheduling_periods', ['user_id']);

	await index('idx_site_availability_date', 'site_availability', ['date']);
	await index('idx_site_availability_site', 'site_availability', ['site_id']);
	await index('idx_site_availability_site_date', 'site_availability', ['site_id', 'date']);

	await index('idx_site_availability_patterns_enabled', 'site_availability_patterns', ['enabled']);
	await index('idx_site_availability_patterns_site', 'site_availability_patterns', ['site_id']);

	await index('idx_site_capacity_rules_clerkship', 'site_capacity_rules', ['clerkship_id']);
	await index('idx_site_capacity_rules_requirement_type', 'site_capacity_rules', [
		'requirement_type',
	]);
	await index('idx_site_capacity_rules_site', 'site_capacity_rules', ['site_id']);

	await index('idx_sites_health_system', 'sites', ['health_system_id']);

	await uniqueIndex('idx_student_health_system_unique', 'student_health_system_onboarding', [
		'student_id',
		'health_system_id',
	]);
	await index('idx_student_onboarding_completed', 'student_health_system_onboarding', [
		'is_completed',
	]);
	await index('idx_student_onboarding_health_system', 'student_health_system_onboarding', [
		'health_system_id',
	]);
	await index('idx_student_onboarding_student', 'student_health_system_onboarding', ['student_id']);

	await index('idx_students_email', 'students', ['email']);

	await index('idx_team_sites_site', 'team_sites', ['site_id']);
	await index('idx_team_sites_team', 'team_sites', ['team_id']);

	await index('idx_teams_health_system', 'teams', ['health_system_id']);
	await index('idx_teams_name', 'teams', ['name']);

	// --------------------------------------------------- better-auth `user`
	// Migrations 023/024/026 bolt two app-owned columns onto better-auth's
	// `user` table, which is created by `ensure-auth-tables.ts` and may not
	// exist yet. Same guard, same outcome — just portable.

	if (await tableExists(db, 'user')) {
		if (!(await columnExists(db, 'user', 'active_schedule_id'))) {
			await db.schema.alterTable('user').addColumn('active_schedule_id', TEXT).execute();
		}
		if (!(await columnExists(db, 'user', 'entitlements'))) {
			await db.schema
				.alterTable('user')
				.addColumn('entitlements', TEXT, (col) => col.notNull().defaultTo('[]'))
				.execute();
		}
	}
}

export async function down(db: Kysely<any>): Promise<void> {
	// Reverse dependency order. Dropping a table drops its indexes with it.
	const tables = [
		'schedule_teams',
		'schedule_students',
		'schedule_sites',
		'schedule_preceptors',
		'schedule_health_systems',
		'schedule_configurations',
		'schedule_clerkships',
		'schedule_assignments',
		'student_health_system_onboarding',
		'site_capacity_rules',
		'site_availability_patterns',
		'site_availability',
		'team_sites',
		'preceptor_team_members',
		'preceptor_teams',
		'preceptor_sites',
		'preceptor_fallbacks',
		'preceptor_capacity_rules',
		'preceptor_availability_patterns',
		'preceptor_availability',
		'global_elective_defaults',
		'global_outpatient_defaults',
		'global_inpatient_defaults',
		'elective_sites',
		'elective_preceptors',
		'clerkship_sites',
		'clerkship_electives',
		'clerkship_configurations',
		'scheduling_periods',
		'blackout_dates',
		'preceptors',
		'teams',
		'sites',
		'students',
		'clerkships',
		'health_systems',
	];

	for (const table of tables) {
		await db.schema.dropTable(table).ifExists().execute();
	}
}
