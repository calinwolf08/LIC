import { Kysely, sql } from 'kysely';

/**
 * Preceptor Associations and Teams Migration
 *
 * Changes:
 * - Create preceptor_clerkships table (many-to-many)
 * - Create preceptor_electives table (many-to-many with elective requirements)
 * - Update teams table to add health_system_id
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Create preceptor_clerkships association table
	await db.schema
		.createTable('preceptor_clerkships')
		.ifNotExists()
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_clerkships_pk', [
			'preceptor_id',
			'clerkship_id'
		])
		.execute();

	// Create indexes for preceptor_clerkships
	await db.schema
		.createIndex('idx_preceptor_clerkships_preceptor')
		.ifNotExists()
		.on('preceptor_clerkships')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_clerkships_clerkship')
		.ifNotExists()
		.on('preceptor_clerkships')
		.column('clerkship_id')
		.execute();

	// Create preceptor_electives association table
	// Note: Electives are stored as clerkship_requirements with requirement_type='elective'
	await db.schema
		.createTable('preceptor_electives')
		.ifNotExists()
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('elective_requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addPrimaryKeyConstraint('preceptor_electives_pk', [
			'preceptor_id',
			'elective_requirement_id'
		])
		.execute();

	// Create indexes for preceptor_electives
	await db.schema
		.createIndex('idx_preceptor_electives_preceptor')
		.ifNotExists()
		.on('preceptor_electives')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_electives_elective')
		.ifNotExists()
		.on('preceptor_electives')
		.column('elective_requirement_id')
		.execute();

	// Create teams table
	await db.schema
		.createTable('teams')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text', (col) =>
			col.notNull().references('health_systems.id').onDelete('restrict')
		)
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Create indexes for teams
	await db.schema
		.createIndex('idx_teams_health_system')
		.ifNotExists()
		.on('teams')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_teams_name')
		.ifNotExists()
		.on('teams')
		.column('name')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop preceptor association tables
	await db.schema.dropTable('preceptor_electives').ifExists().execute();
	await db.schema.dropTable('preceptor_clerkships').ifExists().execute();

	// Drop teams table if it exists (this migration created it)
	await db.schema.dropTable('teams').ifExists().execute();
}
