import { Kysely } from 'kysely';

/**
 * Migration 028: Add preceptor phone type
 *
 * Client feedback F1: when adding a preceptor's phone number, indicate whether
 * it's a cell, office, or home line. Stored as free text ('cell' | 'office' |
 * 'home'); optional, so existing preceptors are unaffected.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptors').addColumn('phone_type', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptors').dropColumn('phone_type').execute();
}
