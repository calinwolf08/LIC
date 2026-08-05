import { Kysely, sql } from 'kysely';

/**
 * Migration 017: Preceptor Multi-Site Support
 *
 * Adds support for preceptors working at multiple sites and teams having multiple sites.
 *
 * Changes:
 * - Create preceptor_sites junction table (preceptor can work at multiple sites)
 * - Create team_sites junction table (team can operate at multiple sites)
 * - Add indexes for efficient lookups
 *
 * Note: The existing site_id column on preceptors table is kept for backwards compatibility
 * but will no longer be used. The preceptor_sites junction table is the source of truth.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Create preceptor_sites junction table
	await db.schema
		.createTable('preceptor_sites')
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('pk_preceptor_sites', ['preceptor_id', 'site_id'])
		.execute();

	// Create team_sites junction table
	await db.schema
		.createTable('team_sites')
		.addColumn('team_id', 'text', (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('pk_team_sites', ['team_id', 'site_id'])
		.execute();

	// Create indexes for efficient lookups
	await db.schema
		.createIndex('idx_preceptor_sites_preceptor')
		.on('preceptor_sites')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_sites_site')
		.on('preceptor_sites')
		.column('site_id')
		.execute();

	await db.schema
		.createIndex('idx_team_sites_team')
		.on('team_sites')
		.column('team_id')
		.execute();

	await db.schema
		.createIndex('idx_team_sites_site')
		.on('team_sites')
		.column('site_id')
		.execute();

	// Migrate existing preceptor site_id data to the new junction table
	// This preserves existing site assignments
	await sql`
		INSERT INTO preceptor_sites (preceptor_id, site_id, created_at)
		SELECT id, site_id, CURRENT_TIMESTAMP
		FROM preceptors
		WHERE site_id IS NOT NULL
	`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropIndex('idx_team_sites_site').execute();
	await db.schema.dropIndex('idx_team_sites_team').execute();
	await db.schema.dropIndex('idx_preceptor_sites_site').execute();
	await db.schema.dropIndex('idx_preceptor_sites_preceptor').execute();
	await db.schema.dropTable('team_sites').execute();
	await db.schema.dropTable('preceptor_sites').execute();
}
