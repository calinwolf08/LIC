import { Kysely, sql } from 'kysely';

/**
 * Migration 014: Make Preceptor Health System Optional
 *
 * Makes health_system_id nullable on preceptors table.
 * This allows creating preceptors without associating them to a health system.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Disable foreign key checks for table recreation
	await sql`PRAGMA foreign_keys = OFF`.execute(db);

	// SQLite doesn't support ALTER COLUMN, so we need to recreate the table
	const existingPreceptors = await db.selectFrom('preceptors').selectAll().execute();

	// Create new table with health_system_id nullable
	await db.schema
		.createTable('preceptors_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull())
		.addColumn('email', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('max_students', 'integer', (col) => col.notNull().defaultTo(1))
		.addColumn('health_system_id', 'text', (col) =>
			col.references('health_systems.id').onDelete('set null')
		)
		.addColumn('site_id', 'text', (col) => col.references('sites.id').onDelete('set null'))
		.addColumn('phone', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Copy existing data
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
				phone: preceptor.phone || null,
				created_at: preceptor.created_at,
				updated_at: preceptor.updated_at
			})
			.execute();
	}

	// Drop old table
	await db.schema.dropTable('preceptors').execute();

	// Rename new table
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	// Recreate indexes
	await db.schema.createIndex('idx_preceptors_email').on('preceptors').column('email').execute();

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

	await db.schema.createIndex('idx_preceptors_site').on('preceptors').column('site_id').execute();

	// Re-enable foreign key checks
	await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	// Disable foreign key checks for table recreation
	await sql`PRAGMA foreign_keys = OFF`.execute(db);
	// Delete preceptors without health_system_id
	await db.deleteFrom('preceptors').where('health_system_id', 'is', null).execute();

	const existingPreceptors = await db.selectFrom('preceptors').selectAll().execute();

	// Create new table with health_system_id NOT NULL
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
		.addColumn('site_id', 'text', (col) => col.references('sites.id').onDelete('set null'))
		.addColumn('phone', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

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
				phone: preceptor.phone,
				created_at: preceptor.created_at,
				updated_at: preceptor.updated_at
			})
			.execute();
	}

	await db.schema.dropTable('preceptors').execute();
	await sql`ALTER TABLE preceptors_new RENAME TO preceptors`.execute(db);

	await db.schema.createIndex('idx_preceptors_email').on('preceptors').column('email').execute();

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

	await db.schema.createIndex('idx_preceptors_site').on('preceptors').column('site_id').execute();

	// Re-enable foreign key checks
	await sql`PRAGMA foreign_keys = ON`.execute(db);
}
