import { Kysely, sql } from 'kysely';

/**
 * Migration 106: half-day sessions on availability patterns.
 *
 * A pattern (e.g. "available Mondays") now carries the session it grants (full /
 * am / pm) and the credit each materialised day is worth, so re-materialising the
 * pattern keeps the half-day setting. AM/PM default to half a day of credit; a
 * full day to one. Mirrors the columns migration 105 added to the materialised
 * `preceptor_availability` rows (L1).
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('preceptor_availability_patterns')
		.addColumn('session', 'text', (col) => col.notNull().defaultTo('full'))
		.execute();
	await sql`ALTER TABLE "preceptor_availability_patterns" ADD COLUMN "credit_value" real NOT NULL DEFAULT 1`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('preceptor_availability_patterns')
		.dropColumn('credit_value')
		.execute();
	await db.schema.alterTable('preceptor_availability_patterns').dropColumn('session').execute();
}
