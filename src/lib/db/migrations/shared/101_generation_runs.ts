/**
 * Migration 101 (shared): `generation_runs`.
 *
 * Every auto-generation apply records one row here (review findings F-24 audit
 * trail, F-25 diagnostics on the Results page, F-12 preview/apply contract): who
 * ran what, when, with which options, the keep/delete plan, and the resulting
 * violations / unmet requirements / statistics. The Results page reads the
 * latest non-preview run for the active schedule from this table.
 *
 * Shared migration rules (see ../shared/README.md): import only from 'kysely',
 * dialect-agnostic builder, idempotent.
 */

import type { Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('generation_runs')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) => col.notNull())
		.addColumn('user_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull())
		.addColumn('mode', 'text', (col) => col.notNull())
		.addColumn('preview', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('options_json', 'text', (col) => col.notNull())
		.addColumn('plan_json', 'text', (col) => col.notNull())
		.addColumn('result_json', 'text', (col) => col.notNull())
		.addColumn('success', 'integer', (col) => col.notNull())
		.addColumn('duration_ms', 'integer', (col) => col.notNull().defaultTo(0))
		.execute();

	await db.schema
		.createIndex('idx_generation_runs_schedule')
		.ifNotExists()
		.on('generation_runs')
		.columns(['schedule_id', 'created_at'])
		.execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
	try {
		await db.schema.dropIndex('idx_generation_runs_schedule').execute();
	} catch {
		// index may not exist
	}
	await db.schema.dropTable('generation_runs').ifExists().execute();
}
