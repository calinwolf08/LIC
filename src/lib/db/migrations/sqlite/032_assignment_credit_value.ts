import { Kysely } from 'kysely';

/**
 * Migration 032: Assignment credit value
 *
 * Client feedback M1/F4: not every scheduled day is worth exactly one day toward
 * a requirement — a half day counts 0.5, a long/double day can count >1. Each
 * assignment carries a `credit_value` (default 1.0) and requirement tracking sums
 * credit rather than counting rows. Defaulted so existing rows keep counting as 1.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('schedule_assignments')
		.addColumn('credit_value', 'real', (col) => col.notNull().defaultTo(1))
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('schedule_assignments').dropColumn('credit_value').execute();
}
