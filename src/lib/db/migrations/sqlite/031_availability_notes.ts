import { Kysely } from 'kysely';

/**
 * Migration 031: Availability notes
 *
 * Client feedback H6: a full availability calendar to plan against, plus notes.
 * The pattern already carries a free-text `reason`; this stores that note on each
 * materialised availability row (`notes`) so the coordinator sees, per day on the
 * calendar, why a day is (un)available — "mornings only", "out for conference".
 * Optional, so existing rows are unaffected. Unlike `preference`, a note is kept
 * for unavailable days too (an "out for conference" day is exactly when it helps).
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptor_availability').addColumn('notes', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptor_availability').dropColumn('notes').execute();
}
