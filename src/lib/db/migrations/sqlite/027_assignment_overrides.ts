/**
 * Migration 027: Assignment override tracking (Step 17)
 *
 * Adds:
 * - `schedule_assignments.override_codes` — JSON array of violation codes the
 *   user explicitly accepted when creating the assignment
 *   (`preceptor_unavailable`, `preceptor_capacity`, `blackout_date`,
 *   `not_onboarded`, `over_required_days`, `past_date`).
 * - `schedule_assignments.override_note`  — optional free text captured at
 *   override time.
 *
 * Idempotent — safe to run multiple times.
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
	const result = await sql<{ count: number }>`
		SELECT COUNT(*) as count FROM pragma_table_info(${table})
		WHERE name = ${column}
	`.execute(db);
	return (result.rows[0]?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
	if (!(await columnExists(db, 'schedule_assignments', 'override_codes'))) {
		await db.schema
			.alterTable('schedule_assignments')
			.addColumn('override_codes', 'text', (col) => col.notNull().defaultTo('[]'))
			.execute();
	}

	if (!(await columnExists(db, 'schedule_assignments', 'override_note'))) {
		await db.schema.alterTable('schedule_assignments').addColumn('override_note', 'text').execute();
	}
}

export async function down(): Promise<void> {
	// SQLite cannot easily drop columns; leave them in place on rollback.
	console.log('Note: override_codes/override_note columns cannot be dropped in SQLite');
}
