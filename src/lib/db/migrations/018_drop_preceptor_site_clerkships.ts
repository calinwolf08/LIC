import { Kysely, sql } from 'kysely';

/**
 * Migration 018: Drop preceptor_site_clerkships table
 *
 * The preceptor_site_clerkships three-way association table is no longer needed.
 * Team membership is now the authoritative source for which clerkships a preceptor handles.
 *
 * The scheduling system has fallback logic to use clerkship_sites when
 * preceptor_site_clerkships is not available.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Drop indexes first
	await db.schema.dropIndex('idx_preceptor_site_clerkships_preceptor').ifExists().execute();
	await db.schema.dropIndex('idx_preceptor_site_clerkships_site').ifExists().execute();
	await db.schema.dropIndex('idx_preceptor_site_clerkships_clerkship').ifExists().execute();

	// Drop the table
	await db.schema.dropTable('preceptor_site_clerkships').ifExists().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Recreate the table
	await db.schema
		.createTable('preceptor_site_clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_site_clerkships_pk', [
			'preceptor_id',
			'site_id',
			'clerkship_id'
		])
		.execute();

	// Recreate indexes
	await db.schema
		.createIndex('idx_preceptor_site_clerkships_preceptor')
		.on('preceptor_site_clerkships')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_site_clerkships_site')
		.on('preceptor_site_clerkships')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_site_clerkships_clerkship')
		.on('preceptor_site_clerkships')
		.column('clerkship_id')
		.execute();
}
