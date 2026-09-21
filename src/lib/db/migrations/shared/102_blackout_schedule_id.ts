/**
 * Migration 102 (shared): schedule_id on blackout_dates.
 *
 * Blackout dates were global — the table had a UNIQUE(date), so a blackout added
 * for one schedule blocked that date for every schedule and flagged every
 * schedule's assignments (tenant-isolation defect, e2e finding P4-d / plan §1.2).
 *
 * This scopes blackouts to a schedule: add `schedule_id` and replace the global
 * UNIQUE(date) with UNIQUE(schedule_id, date). SQLite cannot drop the original
 * column-level UNIQUE(date) in place, so the change is done as a portable table
 * rebuild (create → copy+backfill → drop → rename) that runs identically on
 * SQLite and Postgres. Existing rows are backfilled to the active schedule.
 *
 * Shared migration rules (see ../shared/README.md): import only from 'kysely',
 * dialect-agnostic builder, inlined introspection guard, idempotent.
 */

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
	const tables = await db.introspection.getTables();
	return tables.find((t) => t.name === table)?.columns.some((c) => c.name === column) ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
	// Idempotent: if schedule_id already exists, the rebuild has run.
	if (await columnExists(db, 'blackout_dates', 'schedule_id')) return;

	// New table WITHOUT the global UNIQUE(date); uniqueness is now per schedule.
	await db.schema
		.createTable('blackout_dates_new')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text')
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Copy existing rows, backfilling schedule_id to the active schedule (if any).
	await sql`
		INSERT INTO blackout_dates_new (id, schedule_id, date, reason, created_at)
		SELECT id,
		       (SELECT id FROM scheduling_periods WHERE is_active = 1 LIMIT 1),
		       date, reason, created_at
		FROM blackout_dates
	`.execute(db);

	await db.schema.dropTable('blackout_dates').execute();
	await db.schema.alterTable('blackout_dates_new').renameTo('blackout_dates').execute();

	// One blackout per (schedule, date); plus a plain index for schedule lookups.
	await db.schema
		.createIndex('idx_blackout_dates_schedule_date')
		.ifNotExists()
		.on('blackout_dates')
		.columns(['schedule_id', 'date'])
		.unique()
		.execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
	if (!(await columnExists(db, 'blackout_dates', 'schedule_id'))) return;

	await db.schema
		.createTable('blackout_dates_old')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('date', 'text', (col) => col.notNull().unique())
		.addColumn('reason', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.execute();

	// Collapse back to one row per date (arbitrary pick) to satisfy UNIQUE(date).
	await sql`
		INSERT INTO blackout_dates_old (id, date, reason, created_at)
		SELECT MIN(id), date, MIN(reason), MIN(created_at)
		FROM blackout_dates
		GROUP BY date
	`.execute(db);

	await db.schema.dropTable('blackout_dates').execute();
	await db.schema.alterTable('blackout_dates_old').renameTo('blackout_dates').execute();

	await db.schema
		.createIndex('idx_blackout_dates_date')
		.ifNotExists()
		.on('blackout_dates')
		.column('date')
		.unique()
		.execute();
}
