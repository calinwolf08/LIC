import { Kysely, sql } from 'kysely';

/**
 * Migration 110: Schedule distribution audit log (client feedback K1 / FERPA K2).
 *
 * One row per (send, recipient) so a coordinator can answer "who received which
 * student data, and when". Stores counts and ids only — never the student data
 * itself — per the FERPA scoping decision (docs/plans/ferpa-scoping.md §4).
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('schedule_distributions')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('sender_user_id', 'text', (col) => col.notNull())
		.addColumn('recipient_type', 'text', (col) =>
			col.notNull().check(sql`recipient_type IN ('preceptor', 'student', 'site')`)
		)
		.addColumn('recipient_id', 'text', (col) => col.notNull())
		.addColumn('day_count', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();
	await sql`CREATE INDEX "idx_schedule_distributions_schedule" on "schedule_distributions" ("schedule_id")`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('schedule_distributions').execute();
}
