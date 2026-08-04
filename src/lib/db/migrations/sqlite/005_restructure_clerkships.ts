import { Kysely, sql } from 'kysely';

/**
 * Restructure Clerkships Migration
 *
 * Changes:
 * - Remove inpatient_days and outpatient_days columns
 * - Add clerkship_type column (inpatient or outpatient)
 * - Update required_days to be simple total days
 * - Drop existing data as it will be recreated
 */

export async function up(db: Kysely<any>): Promise<void> {
	// SQLite doesn't support complex ALTER operations, so recreate the table

	// Step 1: Create new table with updated schema
	await db.schema
		.createTable('clerkships_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text') // Optional
		.addColumn('clerkship_type', 'text', (col) =>
			col.notNull().check(sql`clerkship_type IN ('inpatient', 'outpatient')`)
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

	// Step 2: Drop old table (data will be lost, as per user instruction)
	await db.schema.dropTable('clerkships').execute();

	// Step 3: Rename new table to original name
	await sql`ALTER TABLE clerkships_new RENAME TO clerkships`.execute(db);

	// Step 4: Recreate indexes
	await db.schema
		.createIndex('idx_clerkships_specialty')
		.on('clerkships')
		.column('specialty')
		.execute();

	await db.schema
		.createIndex('idx_clerkships_type')
		.on('clerkships')
		.column('clerkship_type')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// Recreate original structure with inpatient_days and outpatient_days
	await db.schema
		.createTable('clerkships_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text', (col) => col.notNull().unique())
		.addColumn('specialty', 'text')
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

	await db.schema.dropTable('clerkships').execute();
	await sql`ALTER TABLE clerkships_new RENAME TO clerkships`.execute(db);

	await db.schema
		.createIndex('idx_clerkships_specialty')
		.on('clerkships')
		.column('specialty')
		.execute();
}
