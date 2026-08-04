import { Kysely } from 'kysely';

/**
 * Migration 013: Add Contact Fields
 *
 * Changes:
 * - Add phone field to preceptors table (optional)
 * - Add additional contact fields to sites table (office_phone, contact_person, contact_email)
 * Note: address field already exists in sites table (from migration 002)
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Add phone to preceptors
	await db.schema.alterTable('preceptors').addColumn('phone', 'text').execute();

	// Add new contact fields to sites (SQLite requires separate ALTER TABLE for each column)
	// Note: address already exists from migration 002, so we only add the new fields
	await db.schema.alterTable('sites').addColumn('office_phone', 'text').execute();
	await db.schema.alterTable('sites').addColumn('contact_person', 'text').execute();
	await db.schema.alterTable('sites').addColumn('contact_email', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptors').dropColumn('phone').execute();

	await db.schema.alterTable('sites').dropColumn('office_phone').execute();
	await db.schema.alterTable('sites').dropColumn('contact_person').execute();
	await db.schema.alterTable('sites').dropColumn('contact_email').execute();
}
