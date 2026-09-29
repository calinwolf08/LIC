import { Kysely, sql } from 'kysely';

/**
 * Migration 107: preceptor mutual exclusions (client feedback L2).
 *
 * A pairwise "these two preceptors should not both supervise the same student on
 * the same day" rule. Assigning a student to both preceptors on one date raises a
 * soft, overrideable warning (`mutual_exclusion`); the paid auto-generation tier
 * avoids the pairing.
 *
 * The pair is stored canonically with preceptor_a_id < preceptor_b_id so the rule
 * is symmetric and cannot be duplicated in either order.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('preceptor_mutual_exclusions')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_a_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('preceptor_b_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('preceptor_mutual_exclusions_unique', [
			'preceptor_a_id',
			'preceptor_b_id'
		])
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('preceptor_mutual_exclusions').execute();
}
