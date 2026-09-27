import { Kysely, sql } from 'kysely';

/**
 * Migration 105: half-day sessions (AM / PM / full day).
 *
 * Client feedback (L1 follow-up): a student may legitimately earn more than one
 * day of credit on a date — e.g. a full-day clerkship in the morning plus a
 * half-day of another clerkship in the afternoon. Credit is no longer capped at
 * one day per date; instead each availability slot and each assignment carries a
 * `session` (am / pm / full) and the app flags only a true session clash (two AM,
 * two PM, or a full day overlapping anything). AM/PM default to half a day of
 * credit; the coordinator can toggle a slot to a full day, and can override an
 * individual assignment's credit independently.
 *
 * - preceptor_availability.session   : 'full' | 'am' | 'pm' (default 'full')
 * - preceptor_availability.credit_value: real, default 1 (the slot's default credit)
 * - schedule_assignments.session     : 'full' | 'am' | 'pm' (default 'full')
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('preceptor_availability')
		.addColumn('session', 'text', (col) => col.notNull().defaultTo('full'))
		.execute();
	await sql`ALTER TABLE "preceptor_availability" ADD COLUMN "credit_value" real NOT NULL DEFAULT 1`.execute(
		db
	);
	await db.schema
		.alterTable('schedule_assignments')
		.addColumn('session', 'text', (col) => col.notNull().defaultTo('full'))
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('schedule_assignments').dropColumn('session').execute();
	await db.schema.alterTable('preceptor_availability').dropColumn('credit_value').execute();
	await db.schema.alterTable('preceptor_availability').dropColumn('session').execute();
}
