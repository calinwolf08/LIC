import { Kysely, sql } from 'kysely';

/**
 * Clerkship Inpatient/Outpatient Days Migration
 *
 * Adds inpatient_days and outpatient_days columns to clerkships table.
 * Makes specialty optional.
 * Updates required_days to be computed from inpatient + outpatient.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support ALTER COLUMN, so we need to recreate the table

	// Step 1: Create temporary table with new schema
	await db.schema
		.createTable('clerkships_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text') // Now nullable
		.addColumn('inpatient_days', 'integer', (col) =>
			col.check(sql`inpatient_days >= 0 OR inpatient_days IS NULL`)
		)
		.addColumn('outpatient_days', 'integer', (col) =>
			col.check(sql`outpatient_days >= 0 OR outpatient_days IS NULL`)
		)
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Step 2: Copy data from old table to new table
	// For existing records, set required_days as before, inpatient/outpatient as null
	await db
		.insertInto('clerkships_new')
		.columns(['id', 'name', 'specialty', 'inpatient_days', 'outpatient_days', 'required_days', 'description', 'created_at', 'updated_at'])
		.expression((eb) =>
			eb
				.selectFrom('clerkships')
				.select([
					'id',
					'name',
					'specialty',
					sql`NULL`.as('inpatient_days'),
					sql`NULL`.as('outpatient_days'),
					'required_days',
					'description',
					'created_at',
					'updated_at'
				])
		)
		.execute();

	// Step 3: Drop old table
	await db.schema.dropTable('clerkships').execute();

	// Step 4: Rename new table to original name
	await sql`ALTER TABLE clerkships_new RENAME TO clerkships`.execute(db);

	// Step 5: Recreate indexes
	await db.schema
		.createIndex('idx_clerkships_specialty')
		.on('clerkships')
		.column('specialty')
		.execute();

	// Step 6: Add check constraint that at least one of inpatient_days or outpatient_days is set
	// Note: This is enforced at application level since SQLite doesn't support adding
	// complex constraints after table creation easily
}

export async function down(db: Kysely<any>): Promise<void> {
	// Recreate original table structure
	await db.schema
		.createTable('clerkships_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text', (col) => col.notNull())
		.addColumn('required_days', 'integer', (col) =>
			col.notNull().check(sql`required_days > 0`)
		)
		.addColumn('description', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Copy data back (will fail if specialty is NULL in any row)
	await db
		.insertInto('clerkships_new')
		.columns(['id', 'name', 'specialty', 'required_days', 'description', 'created_at', 'updated_at'])
		.expression((eb) =>
			eb
				.selectFrom('clerkships')
				.select(['id', 'name', 'specialty', 'required_days', 'description', 'created_at', 'updated_at'])
		)
		.execute();

	await db.schema.dropTable('clerkships').execute();
	await sql`ALTER TABLE clerkships_new RENAME TO clerkships`.execute(db);

	// Recreate index
	await db.schema
		.createIndex('idx_clerkships_specialty')
		.on('clerkships')
		.column('specialty')
		.execute();
}
