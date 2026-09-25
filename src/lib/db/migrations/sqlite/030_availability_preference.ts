import { Kysely } from 'kysely';

/**
 * Migration 030: Availability preference levels
 *
 * Client feedback H8: a preceptor's available days can be tagged 'preferred' or
 * 'in_a_pinch' (a fallback you'd rather not use). Stored as optional free text on
 * both the pattern (source of truth) and the materialised availability rows (what
 * the calendar and the generator read). Basic surfaces it; the paid engine
 * weights it. Optional, so existing rows are unaffected.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('preceptor_availability_patterns')
		.addColumn('preference', 'text')
		.execute();
	await db.schema.alterTable('preceptor_availability').addColumn('preference', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptor_availability').dropColumn('preference').execute();
	await db.schema
		.alterTable('preceptor_availability_patterns')
		.dropColumn('preference')
		.execute();
}
