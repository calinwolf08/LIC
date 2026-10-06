import { Kysely } from 'kysely';

/**
 * Migration 033: Clerkship minimum required days
 *
 * Client feedback E2: some clerkships allow a student to "miss" a few days — they
 * are considered complete at a minimum threshold even if below the full required
 * days. `min_required_days` is that allowable-miss floor. Nullable: NULL means the
 * clerkship has no separate minimum, so full `required_days` is the completion
 * target (existing behaviour).
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable('clerkships')
		.addColumn('min_required_days', 'integer')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.alterTable('clerkships').dropColumn('min_required_days').execute();
}
