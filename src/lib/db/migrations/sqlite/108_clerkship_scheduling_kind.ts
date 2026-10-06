import { Kysely, sql } from 'kysely';

/**
 * Migration 108: Clerkship scheduling kind (client feedback L3)
 *
 * A clerkship is scheduled either as a `block` (inpatient — the student is on it
 * for whole weeks) or `scattered` (outpatient — individual days). Weeks consumed
 * by a block are derived from its assignments and become unavailable for
 * scattered days; the validator warns on the overlap.
 *
 * Defaults to 'scattered' so existing clerkships keep their current
 * (day-by-day) behaviour.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('clerkships')
		.addColumn('scheduling_kind', 'text', (col) =>
			col.notNull().defaultTo('scattered').check(sql`scheduling_kind IN ('block', 'scattered')`)
		)
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('clerkships').dropColumn('scheduling_kind').execute();
}
