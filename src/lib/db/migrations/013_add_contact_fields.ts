import { Kysely } from 'kysely';

/**
 * Migration 013: Add Contact Fields
 *
 * Changes:
 * - Add phone field to preceptors table (optional)
 * - Add contact fields to sites table (address, office_phone, contact_person, contact_email)
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Add phone to preceptors
	await db.schema.alterTable('preceptors').addColumn('phone', 'text').execute();

	// Add contact fields to sites
	await db.schema
		.alterTable('sites')
		.addColumn('address', 'text')
		.addColumn('office_phone', 'text')
		.addColumn('contact_person', 'text')
		.addColumn('contact_email', 'text')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('preceptors').dropColumn('phone').execute();

	await db.schema
		.alterTable('sites')
		.dropColumn('address')
		.dropColumn('office_phone')
		.dropColumn('contact_person')
		.dropColumn('contact_email')
		.execute();
}
