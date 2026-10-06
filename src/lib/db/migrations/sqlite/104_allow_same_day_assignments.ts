import { Kysely, sql } from 'kysely';

/**
 * Migration 104: allow same-day assignments (half-days / AM-PM).
 *
 * Client feedback L1: a student may need more than one assignment on a single
 * calendar day — e.g. a morning and an afternoon half-day. The old hard rule
 * "one place per day" was enforced by a UNIQUE index on (student_id, date),
 * which made half-days impossible.
 *
 * We drop that uniqueness and keep a plain (non-unique) index for the same-day
 * lookups the validators and read models rely on. Same-day capacity is now an
 * application-level, credit-aware check (`day_overbooked`, a soft/overridable
 * warning when a student's total credit on a day exceeds one full day), not a
 * database constraint. Runs after the 100-series table rebuilds that recreated
 * this index as UNIQUE.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await sql`DROP INDEX IF EXISTS "idx_assignments_student_date"`.execute(db);
	await sql`CREATE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	// Best-effort restore of the unique index. This can fail if same-day rows now
	// exist (which is the whole point of the migration), so callers rolling back
	// must first collapse any half-day pairs.
	await sql`DROP INDEX IF EXISTS "idx_assignments_student_date"`.execute(db);
	await sql`CREATE UNIQUE INDEX "idx_assignments_student_date" on "schedule_assignments" ("student_id", "date")`.execute(
		db
	);
}
