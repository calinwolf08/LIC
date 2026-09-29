import { Kysely, sql } from 'kysely';

/**
 * Migration 109: Non-clinical assignments + quarters (client feedback M2/M3/M4).
 *
 * A schedule day can now be a non-clinical assignment — a `free_day` or an `exam`
 * — that occupies the student's day (so it still blocks double-booking) but needs
 * no preceptor, clerkship or site and never counts toward clinical requirements.
 *
 *  - `schedule_assignments.kind` = 'clinical' | 'free_day' | 'exam' (default
 *    'clinical', so every existing row stays clinical).
 *  - `schedule_assignments.preceptor_id` becomes nullable (a non-clinical day has
 *    no preceptor). SQLite can't drop NOT NULL in place, so the table is rebuilt —
 *    the same approach migration 103 used to make clerkship_id nullable.
 *  - `schedule_quarters` holds optional quarter date ranges per schedule (M4).
 */

export async function up(db: Kysely<any>): Promise<void> {
	await sql`PRAGMA foreign_keys = OFF`.execute(db);

	// --- schedule_assignments: preceptor_id nullable + kind column ---------------
	await sql`
		CREATE TABLE "schedule_assignments_new" (
			"id" text primary key,
			"student_id" text not null references "students" ("id") on delete cascade,
			"preceptor_id" text references "preceptors" ("id") on delete restrict,
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
			"schedule_id" text,
			"session" text default 'full' not null,
			"kind" text default 'clinical' not null check (kind IN ('clinical', 'free_day', 'exam'))
		)
	`.execute(db);
	await sql`
		INSERT INTO "schedule_assignments_new"
		SELECT "id","student_id","preceptor_id","clerkship_id","date","status","created_at","updated_at",
			"site_id","elective_id","locked","source","override_codes","override_note","credit_value","schedule_id",
			"session",'clinical'
		FROM "schedule_assignments"
	`.execute(db);
	await sql`DROP TABLE "schedule_assignments"`.execute(db);
	await sql`ALTER TABLE "schedule_assignments_new" RENAME TO "schedule_assignments"`.execute(db);
	// Recreate indexes. student_date is NON-unique (migration 104 allows half-days).
	await sql`CREATE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
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

	// --- schedule_quarters (M4) --------------------------------------------------
	await db.schema
		.createTable('schedule_quarters')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('start_date', 'text', (col) => col.notNull())
		.addColumn('end_date', 'text', (col) => col.notNull())
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
	await sql`CREATE INDEX "idx_schedule_quarters_schedule" on "schedule_quarters" ("schedule_id")`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DROP TABLE IF EXISTS "schedule_quarters"`.execute(db);

	await sql`PRAGMA foreign_keys = OFF`.execute(db);
	// Non-clinical rows would violate the restored NOT NULL on preceptor_id.
	await sql`DELETE FROM "schedule_assignments" WHERE "preceptor_id" IS NULL`.execute(db);
	await sql`
		CREATE TABLE "schedule_assignments_old" (
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
			"schedule_id" text,
			"session" text default 'full' not null
		)
	`.execute(db);
	await sql`
		INSERT INTO "schedule_assignments_old"
		SELECT "id","student_id","preceptor_id","clerkship_id","date","status","created_at","updated_at",
			"site_id","elective_id","locked","source","override_codes","override_note","credit_value","schedule_id","session"
		FROM "schedule_assignments"
	`.execute(db);
	await sql`DROP TABLE "schedule_assignments"`.execute(db);
	await sql`ALTER TABLE "schedule_assignments_old" RENAME TO "schedule_assignments"`.execute(db);
	await sql`CREATE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
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
