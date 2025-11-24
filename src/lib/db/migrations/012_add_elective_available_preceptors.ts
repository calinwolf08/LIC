/**
 * Migration 012: Add available_preceptor_ids column to clerkship_electives
 *
 * This column stores the list of preceptor IDs that are available for this elective option.
 */

import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Add available_preceptor_ids column to clerkship_electives
	await db.schema
		.alterTable('clerkship_electives')
		.addColumn('available_preceptor_ids', 'text', (col) => col.notNull().defaultTo('[]'))
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Remove available_preceptor_ids column
	await db.schema
		.alterTable('clerkship_electives')
		.dropColumn('available_preceptor_ids')
		.execute();
}
