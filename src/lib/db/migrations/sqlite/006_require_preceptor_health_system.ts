import { Kysely, sql } from 'kysely';

/**
 * Require Preceptor Health System Migration
 *
 * Makes health_system_id required (NOT NULL) on preceptors table.
 * Drops preceptors without a health_system_id as per user instruction.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Step 1: Delete preceptors without health_system_id
	await db
		.deleteFrom('preceptors')
		.where('health_system_id', 'is', null)
		.execute();

	// Step 2: Recreate preceptors table with health_system_id as NOT NULL
	// Get existing data
	const existingPreceptors = await db
		.selectFrom('preceptors')
		.selectAll()
		.execute();

	// Create new table with health_system_id required
	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('health_system_id', 'text', (col) =>
			col.notNull().references('health_systems.id').onDelete('restrict')
		)
		.addColumn('site_id', 'text', (col) =>
			col.references('sites.id').onDelete('set null')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Copy data (all remaining preceptors have health_system_id)
	if (existingPreceptors.length > 0) {
		for (const preceptor of existingPreceptors) {
			await db
				.insertInto('preceptors_new')
				.values({
					id: preceptor.id,
					name: preceptor.name,
					email: preceptor.email,
					specialty: preceptor.specialty,
					max_students: preceptor.max_students,
					health_system_id: preceptor.health_system_id,
					site_id: preceptor.site_id,
					created_at: preceptor.created_at,
					updated_at: preceptor.updated_at
				})
				.execute();
		}
	}

	// Drop old table
	await db.schema.dropTable('preceptors').execute();

	// Rename new table
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	// Recreate indexes
	await db.schema
		.createIndex('idx_preceptors_email')
		.on('preceptors')
		.column('email')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_specialty')
		.on('preceptors')
		.column('specialty')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_health_system')
		.on('preceptors')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_site')
		.on('preceptors')
		.column('site_id')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Make health_system_id nullable again
	const existingPreceptors = await db
		.selectFrom('preceptors')
		.selectAll()
		.execute();

	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('health_system_id', 'text', (col) =>
			col.references('health_systems.id').onDelete('restrict')
		)
		.addColumn('site_id', 'text', (col) =>
			col.references('sites.id').onDelete('set null')
		)
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	for (const preceptor of existingPreceptors) {
		await db
			.insertInto('preceptors_new')
			.values(preceptor)
			.execute();
	}

	await db.schema.dropTable('preceptors').execute();
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	await db.schema
		.createIndex('idx_preceptors_email')
		.on('preceptors')
		.column('email')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_specialty')
		.on('preceptors')
		.column('specialty')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_health_system')
		.on('preceptors')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_preceptors_site')
		.on('preceptors')
		.column('site_id')
		.execute();
}
