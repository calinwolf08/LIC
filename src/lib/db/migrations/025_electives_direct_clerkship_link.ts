/**
 * Migration 025: Electives Direct Clerkship Link
 *
 * Restructures electives to link directly to clerkships instead of through requirements:
 * - Adds clerkship_id column to clerkship_electives
 * - Adds settings override columns to clerkship_electives (like mini-clerkships)
 * - Migrates data from requirement_id to clerkship_id
 * - Removes requirement_id column
 * - Removes clerkship_requirements table (no longer needed)
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Step 1: Get existing electives with their clerkship_ids (via requirements)
	const existingElectives = await db
		.selectFrom('clerkship_electives as e')
		.innerJoin('clerkship_requirements as r', 'e.requirement_id', 'r.id')
		.select([
			'e.id as elective_id',
			'r.clerkship_id as clerkship_id'
		])
		.execute();

	// Step 2: Create new clerkship_electives table with clerkship_id and settings
	await db.schema
		.createTable('clerkship_electives_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('minimum_days', 'integer', (col) =>
			col.notNull().check(sql`minimum_days > 0`)
		)
		.addColumn('specialty', 'text')
		.addColumn('is_required', 'integer', (col) => col.notNull().defaultTo(1))
		// Settings override columns (inherit from clerkship by default)
		.addColumn('override_mode', 'text', (col) =>
			col.notNull().defaultTo('inherit').check(sql`override_mode IN ('inherit', 'override')`)
		)
		.addColumn('override_assignment_strategy', 'text')
		.addColumn('override_health_system_rule', 'text')
		.addColumn('override_max_students_per_day', 'integer')
		.addColumn('override_max_students_per_year', 'integer')
		.addColumn('override_allow_fallbacks', 'integer')
		.addColumn('override_allow_teams', 'integer')
		.addColumn('override_fallback_requires_approval', 'integer')
		.addColumn('override_fallback_allow_cross_system', 'integer')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Step 3: Copy existing data to new table with clerkship_id
	const oldElectives = await db
		.selectFrom('clerkship_electives')
		.selectAll()
		.execute();

	for (const elective of oldElectives) {
		// Find the clerkship_id from our earlier query
		const mapping = existingElectives.find(e => e.elective_id === elective.id);
		if (mapping) {
			await db
				.insertInto('clerkship_electives_new')
				.values({
					id: elective.id,
					clerkship_id: mapping.clerkship_id,
					name: elective.name,
					minimum_days: elective.minimum_days,
					specialty: elective.specialty,
					is_required: elective.is_required ?? 1,
					override_mode: 'inherit',
					created_at: elective.created_at,
					updated_at: elective.updated_at,
				})
				.execute();
		}
	}

	// Step 4: Drop old table and rename new one
	// First, we need to handle foreign key references from elective_sites and elective_preceptors
	// These reference clerkship_electives.id which we're preserving, so the IDs stay the same

	await db.schema.dropTable('clerkship_electives').execute();
	await sql`ALTER TABLE clerkship_electives_new RENAME TO clerkship_electives`.execute(db);

	// Step 5: Recreate indexes
	await db.schema
		.createIndex('idx_electives_clerkship')
		.on('clerkship_electives')
		.column('clerkship_id')
		.execute();

	// Step 6: Drop clerkship_requirements table (no longer needed)
	// First drop the dependent table
	await db.schema.dropTable('clerkship_requirement_overrides').ifExists().execute();
	await db.schema.dropTable('clerkship_requirements').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// This is a destructive migration - we can't fully restore clerkship_requirements
	// For down migration, we'll recreate the structure but data will be lost

	// Recreate clerkship_requirements table
	await db.schema
		.createTable('clerkship_requirements')
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
			col.notNull().defaultTo('inherit')
		)
		.addColumn('override_assignment_strategy', 'text')
		.addColumn('override_health_system_rule', 'text')
		.addColumn('override_block_length_days', 'integer')
		.addColumn('override_allow_split_assignments', 'integer')
		.addColumn('override_preceptor_continuity_preference', 'text')
		.addColumn('override_team_continuity_preference', 'text')
		.addColumn('require_same_preceptor_team', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('require_same_site', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Recreate clerkship_requirement_overrides table
	await db.schema
		.createTable('clerkship_requirement_overrides')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('field_name', 'text', (col) => col.notNull())
		.addColumn('is_overridden', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Get current electives
	const electives = await db
		.selectFrom('clerkship_electives')
		.selectAll()
		.execute();

	// Create elective requirements for each clerkship that has electives
	const clerkshipIds = [...new Set(electives.map(e => e.clerkship_id))];
	const requirementMap = new Map<string, string>();

	for (const clerkshipId of clerkshipIds) {
		const clerkshipElectives = electives.filter(e => e.clerkship_id === clerkshipId);
		const totalDays = clerkshipElectives.reduce((sum, e) => sum + e.minimum_days, 0);

		const requirementId = `req_${clerkshipId}_elective`;
		await db
			.insertInto('clerkship_requirements')
			.values({
				id: requirementId,
				clerkship_id: clerkshipId,
				requirement_type: 'elective',
				required_days: totalDays,
				allow_cross_system: 0,
				override_mode: 'inherit',
				require_same_preceptor_team: 0,
				require_same_site: 0,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		requirementMap.set(clerkshipId, requirementId);
	}

	// Recreate old clerkship_electives table with requirement_id
	await db.schema
		.createTable('clerkship_electives_old')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('requirement_id', 'text', (col) =>
			col.notNull().references('clerkship_requirements.id').onDelete('cascade')
		)
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('minimum_days', 'integer', (col) =>
			col.notNull().check(sql`minimum_days > 0`)
		)
		.addColumn('specialty', 'text')
		.addColumn('is_required', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('available_preceptor_ids', 'text', (col) => col.notNull().defaultTo('[]'))
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Copy data back
	for (const elective of electives) {
		const requirementId = requirementMap.get(elective.clerkship_id);
		if (requirementId) {
			await db
				.insertInto('clerkship_electives_old')
				.values({
					id: elective.id,
					requirement_id: requirementId,
					name: elective.name,
					minimum_days: elective.minimum_days,
					specialty: elective.specialty,
					is_required: elective.is_required,
					available_preceptor_ids: '[]',
					created_at: elective.created_at,
					updated_at: elective.updated_at,
				})
				.execute();
		}
	}

	// Drop new table and rename old one
	await db.schema.dropTable('clerkship_electives').execute();
	await sql`ALTER TABLE clerkship_electives_old RENAME TO clerkship_electives`.execute(db);

	// Recreate index
	await db.schema
		.createIndex('idx_electives_requirement')
		.on('clerkship_electives')
		.column('requirement_id')
		.execute();
}
