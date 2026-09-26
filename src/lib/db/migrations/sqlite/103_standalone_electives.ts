import { Kysely, sql } from 'kysely';

/**
 * Migration 103: Standalone electives (no parent clerkship)
 *
 * Numbered after the 100-series so the schedule_assignments rebuild below sees the
 * full column set (schedule_id is added by migration 100).
 *
 * Client feedback E3: an elective can be standalone/optional — not owned by any
 * clerkship. Its days count only toward the elective, never a clerkship total
 * (R4.4). This makes `clerkship_electives.clerkship_id` nullable (NULL = standalone)
 * and `schedule_assignments.clerkship_id` nullable (a standalone-elective day has
 * no clerkship). SQLite can't drop NOT NULL in place, so both tables are rebuilt.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await sql`PRAGMA foreign_keys = OFF`.execute(db);

	// --- clerkship_electives: clerkship_id nullable, ON DELETE keeps standalone ---
	await sql`
		CREATE TABLE "clerkship_electives_new" (
			"id" text primary key,
			"clerkship_id" text references "clerkships" ("id") on delete cascade,
			"name" text not null,
			"minimum_days" integer not null check (minimum_days > 0),
			"specialty" text,
			"is_required" integer default 1 not null,
			"override_mode" text default 'inherit' not null check (override_mode IN ('inherit', 'override')),
			"override_assignment_strategy" text,
			"override_health_system_rule" text,
			"override_max_students_per_day" integer,
			"override_max_students_per_year" integer,
			"override_allow_fallbacks" integer,
			"override_allow_teams" integer,
			"override_fallback_requires_approval" integer,
			"override_fallback_allow_cross_system" integer,
			"created_at" text default CURRENT_TIMESTAMP not null,
			"updated_at" text default CURRENT_TIMESTAMP not null
		)
	`.execute(db);
	await sql`
		INSERT INTO "clerkship_electives_new"
		SELECT "id","clerkship_id","name","minimum_days","specialty","is_required","override_mode",
			"override_assignment_strategy","override_health_system_rule","override_max_students_per_day",
			"override_max_students_per_year","override_allow_fallbacks","override_allow_teams",
			"override_fallback_requires_approval","override_fallback_allow_cross_system","created_at","updated_at"
		FROM "clerkship_electives"
	`.execute(db);
	await sql`DROP TABLE "clerkship_electives"`.execute(db);
	await sql`ALTER TABLE "clerkship_electives_new" RENAME TO "clerkship_electives"`.execute(db);
	await sql`CREATE INDEX "idx_electives_clerkship" on "clerkship_electives" ("clerkship_id")`.execute(
		db
	);

	// --- schedule_assignments: clerkship_id nullable ---
	await sql`
		CREATE TABLE "schedule_assignments_new" (
			"id" text primary key,
			"student_id" text not null references "students" ("id") on delete cascade,
			"preceptor_id" text not null references "preceptors" ("id") on delete restrict,
			"clerkship_id" text references "clerkships" ("id") on delete restrict,
			"date" text not null,
			"status" text default 'scheduled' not null,
			"created_at" text default CURRENT_TIMESTAMP not null,
			"updated_at" text default CURRENT_TIMESTAMP not null,
			"site_id" text,
			"elective_id" text references "clerkship_electives" ("id") on delete set null,
			"locked" integer default 0 not null,
			"source" text default 'manual' not null,
			"override_codes" text default '[]' not null,
			"override_note" text,
			"credit_value" real default 1 not null,
			"schedule_id" text
		)
	`.execute(db);
	await sql`
		INSERT INTO "schedule_assignments_new"
		SELECT "id","student_id","preceptor_id","clerkship_id","date","status","created_at","updated_at",
			"site_id","elective_id","locked","source","override_codes","override_note","credit_value","schedule_id"
		FROM "schedule_assignments"
	`.execute(db);
	await sql`DROP TABLE "schedule_assignments"`.execute(db);
	await sql`ALTER TABLE "schedule_assignments_new" RENAME TO "schedule_assignments"`.execute(db);
	await sql`CREATE UNIQUE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_assignments_preceptor_date" on "schedule_assignments" ("preceptor_id", "date")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_assignments_date" on "schedule_assignments" ("date")`.execute(db);
	await sql`CREATE INDEX "idx_assignments_clerkship" on "schedule_assignments" ("clerkship_id")`.execute(
		db
	);
	await sql`CREATE INDEX idx_schedule_assignments_site ON schedule_assignments(site_id)`.execute(db);
	await sql`CREATE INDEX "idx_assignments_elective" on "schedule_assignments" ("elective_id")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_schedule_assignments_schedule" on "schedule_assignments" ("schedule_id")`.execute(
		db
	);

	await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`PRAGMA foreign_keys = OFF`.execute(db);

	// Drop rows that would violate the restored NOT NULL, then rebuild NOT NULL.
	await sql`DELETE FROM "schedule_assignments" WHERE "clerkship_id" IS NULL`.execute(db);
	await sql`DELETE FROM "clerkship_electives" WHERE "clerkship_id" IS NULL`.execute(db);

	await sql`
		CREATE TABLE "schedule_assignments_old" (
			"id" text primary key,
			"student_id" text not null references "students" ("id") on delete cascade,
			"preceptor_id" text not null references "preceptors" ("id") on delete restrict,
			"clerkship_id" text not null references "clerkships" ("id") on delete restrict,
			"date" text not null,
			"status" text default 'scheduled' not null,
			"created_at" text default CURRENT_TIMESTAMP not null,
			"updated_at" text default CURRENT_TIMESTAMP not null,
			"site_id" text,
			"elective_id" text references "clerkship_electives" ("id") on delete set null,
			"locked" integer default 0 not null,
			"source" text default 'manual' not null,
			"override_codes" text default '[]' not null,
			"override_note" text,
			"credit_value" real default 1 not null,
			"schedule_id" text
		)
	`.execute(db);
	await sql`
		INSERT INTO "schedule_assignments_old"
		SELECT "id","student_id","preceptor_id","clerkship_id","date","status","created_at","updated_at",
			"site_id","elective_id","locked","source","override_codes","override_note","credit_value","schedule_id"
		FROM "schedule_assignments"
	`.execute(db);
	await sql`DROP TABLE "schedule_assignments"`.execute(db);
	await sql`ALTER TABLE "schedule_assignments_old" RENAME TO "schedule_assignments"`.execute(db);
	await sql`CREATE UNIQUE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_assignments_preceptor_date" on "schedule_assignments" ("preceptor_id", "date")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_assignments_date" on "schedule_assignments" ("date")`.execute(db);
	await sql`CREATE INDEX "idx_assignments_clerkship" on "schedule_assignments" ("clerkship_id")`.execute(
		db
	);
	await sql`CREATE INDEX idx_schedule_assignments_site ON schedule_assignments(site_id)`.execute(db);
	await sql`CREATE INDEX "idx_assignments_elective" on "schedule_assignments" ("elective_id")`.execute(
		db
	);
	await sql`CREATE INDEX "idx_schedule_assignments_schedule" on "schedule_assignments" ("schedule_id")`.execute(
		db
	);

	await sql`
		CREATE TABLE "clerkship_electives_old" (
			"id" text primary key,
			"clerkship_id" text not null references "clerkships" ("id") on delete cascade,
			"name" text not null,
			"minimum_days" integer not null check (minimum_days > 0),
			"specialty" text,
			"is_required" integer default 1 not null,
			"override_mode" text default 'inherit' not null check (override_mode IN ('inherit', 'override')),
			"override_assignment_strategy" text,
			"override_health_system_rule" text,
			"override_max_students_per_day" integer,
			"override_max_students_per_year" integer,
			"override_allow_fallbacks" integer,
			"override_allow_teams" integer,
			"override_fallback_requires_approval" integer,
			"override_fallback_allow_cross_system" integer,
			"created_at" text default CURRENT_TIMESTAMP not null,
			"updated_at" text default CURRENT_TIMESTAMP not null
		)
	`.execute(db);
	await sql`
		INSERT INTO "clerkship_electives_old"
		SELECT "id","clerkship_id","name","minimum_days","specialty","is_required","override_mode",
			"override_assignment_strategy","override_health_system_rule","override_max_students_per_day",
			"override_max_students_per_year","override_allow_fallbacks","override_allow_teams",
			"override_fallback_requires_approval","override_fallback_allow_cross_system","created_at","updated_at"
		FROM "clerkship_electives"
	`.execute(db);
	await sql`DROP TABLE "clerkship_electives"`.execute(db);
	await sql`ALTER TABLE "clerkship_electives_old" RENAME TO "clerkship_electives"`.execute(db);
	await sql`CREATE INDEX "idx_electives_clerkship" on "clerkship_electives" ("clerkship_id")`.execute(
		db
	);

	await sql`PRAGMA foreign_keys = ON`.execute(db);
}
