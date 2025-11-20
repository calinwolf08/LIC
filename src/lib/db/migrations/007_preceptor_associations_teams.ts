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
		.on('preceptor_clerkships')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_clerkships_clerkship')
		.on('preceptor_clerkships')
		.column('clerkship_id')
		.execute();

	// Create preceptor_electives association table
	// Note: Electives are stored as clerkship_requirements with requirement_type='elective'
	await db.schema
		.createTable('preceptor_electives')
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
		.on('preceptor_electives')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptor_electives_elective')
		.on('preceptor_electives')
		.column('elective_requirement_id')
		.execute();

	// Update teams table to add health_system_id
	// Get existing teams data
	const existingTeams = await db.selectFrom('teams').selectAll().execute();

	// Create new teams table with health_system_id
	await db.schema
		.createTable('teams_new')
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

	// Copy existing teams data if any
	// Note: This will fail if there are existing teams without health_system_id
	// User should ensure teams are properly associated before migration
	if (existingTeams.length > 0) {
		for (const team of existingTeams) {
			// Skip teams without health_system_id as we can't migrate them
			if (team.health_system_id) {
				await db
					.insertInto('teams_new')
					.values({
						id: team.id,
						name: team.name,
						health_system_id: team.health_system_id,
						description: team.description,
						created_at: team.created_at,
						updated_at: team.updated_at
					})
					.execute();
			}
		}
	}

	// Drop old teams table
	await db.schema.dropTable('teams').execute();

	// Rename new table
	await sql`ALTER TABLE teams_new RENAME TO teams`.execute(db);

	// Create indexes for teams
	await db.schema
		.createIndex('idx_teams_health_system')
		.on('teams')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_teams_name')
		.on('teams')
		.column('name')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop preceptor association tables
	await db.schema.dropTable('preceptor_electives').execute();
	await db.schema.dropTable('preceptor_clerkships').execute();

	// Revert teams table (make health_system_id optional)
	const existingTeams = await db.selectFrom('teams').selectAll().execute();

	await db.schema
		.createTable('teams_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('health_system_id', 'text', (col) =>
			col.references('health_systems.id').onDelete('restrict')
		)
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	for (const team of existingTeams) {
		await db.insertInto('teams_new').values(team).execute();
	}

	await db.schema.dropTable('teams').execute();
	await sql`ALTER TABLE teams_new RENAME TO teams`.execute(db);

	await db.schema
		.createIndex('idx_teams_health_system')
		.on('teams')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_teams_name')
		.on('teams')
		.column('name')
		.execute();
}
