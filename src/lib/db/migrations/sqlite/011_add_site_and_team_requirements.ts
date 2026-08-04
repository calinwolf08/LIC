import { Kysely, sql } from 'kysely';

/**
 * Add Site and Team Requirement Fields
 *
 * Changes:
 * - Add require_same_site to clerkship_requirements
 * - Add require_same_preceptor_team to clerkship_requirements
 *
 * These fields control whether students must:
 * - Complete a requirement at the same site (require_same_site)
 * - Work with the same preceptor team throughout (require_same_preceptor_team)
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Get existing requirements
	const existingRequirements = await db
		.selectFrom('clerkship_requirements')
		.selectAll()
		.execute();

	// Create new table with additional fields
	await db.schema
		.createTable('clerkship_requirements_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('requirement_type', 'text', (col) =>
			col.notNull().check(sql`requirement_type IN ('inpatient', 'outpatient', 'elective')`)
		)
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		.addColumn('allow_cross_system', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_site', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_preceptor_team', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('override_mode', 'text', (col) =>
			col
				.notNull()
				.defaultTo('inherit')
				.check(sql`override_mode IN ('inherit', 'override_fields', 'override_section')`)
		)
		.addColumn('override_assignment_strategy', 'text')
		.addColumn('override_health_system_rule', 'text')
		.addColumn('override_block_length_days', 'integer')
		.addColumn('override_allow_split_assignments', 'integer')
		.addColumn('override_preceptor_continuity_preference', 'text')
		.addColumn('override_team_continuity_preference', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Copy existing data, setting new fields to 0 (false) by default
	for (const requirement of existingRequirements) {
		await db
			.insertInto('clerkship_requirements_new')
			.values({
				...requirement,
				require_same_site: 0,
				require_same_preceptor_team: 0
			})
			.execute();
	}

	// Drop old table
	await db.schema.dropTable('clerkship_requirements').execute();

	// Rename new table
	await sql`ALTER TABLE clerkship_requirements_new RENAME TO clerkship_requirements`.execute(
		db
	);

	// Recreate indexes
	await db.schema
		.createIndex('idx_clerkship_requirements_clerkship')
		.on('clerkship_requirements')
		.column('clerkship_id')
		.execute();

	await db.schema
		.createIndex('idx_clerkship_requirements_type')
		.on('clerkship_requirements')
		.column('requirement_type')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Get existing requirements
	const existingRequirements = await db
		.selectFrom('clerkship_requirements')
		.selectAll()
		.execute();

	// Create table without new fields
	await db.schema
		.createTable('clerkship_requirements_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('requirement_type', 'text', (col) =>
			col.notNull().check(sql`requirement_type IN ('inpatient', 'outpatient', 'elective')`)
		)
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		.addColumn('allow_cross_system', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('override_mode', 'text', (col) =>
			col
				.notNull()
				.defaultTo('inherit')
				.check(sql`override_mode IN ('inherit', 'override_fields', 'override_section')`)
		)
		.addColumn('override_assignment_strategy', 'text')
		.addColumn('override_health_system_rule', 'text')
		.addColumn('override_block_length_days', 'integer')
		.addColumn('override_allow_split_assignments', 'integer')
		.addColumn('override_preceptor_continuity_preference', 'text')
		.addColumn('override_team_continuity_preference', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Copy data back (dropping new fields)
	for (const requirement of existingRequirements) {
		const { require_same_site, require_same_preceptor_team, ...rest } = requirement as any;
		await db.insertInto('clerkship_requirements_new').values(rest).execute();
	}

	// Drop old table
	await db.schema.dropTable('clerkship_requirements').execute();

	// Rename new table
	await sql`ALTER TABLE clerkship_requirements_new RENAME TO clerkship_requirements`.execute(
		db
	);

	// Recreate indexes
	await db.schema
		.createIndex('idx_clerkship_requirements_clerkship')
		.on('clerkship_requirements')
		.column('clerkship_id')
		.execute();

	await db.schema
		.createIndex('idx_clerkship_requirements_type')
		.on('clerkship_requirements')
		.column('requirement_type')
		.execute();
}
