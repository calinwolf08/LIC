/**
 * Migration 100 (shared): schedule_id on schedule_assignments.
 *
 * Assignments have historically carried no direct schedule link — ownership
 * flowed through the assigned student's `schedule_students` row. That is
 * ambiguous once a student belongs to more than one of a user's schedules (the
 * junction design allows it), and it forces every scope check into a join. This
 * adds an explicit, indexed `schedule_id` and backfills it from
 * `schedule_students`, so generation and deletion can scope to one schedule
 * unambiguously (review finding F-02 / `04-schema-alignment.md`).
 *
 * Nullable: pre-existing rows whose student is in no schedule stay NULL rather
 * than blocking the migration; every write path sets it going forward.
 *
 * Shared migration rules (see ../shared/README.md): import only from 'kysely',
 * dialect-agnostic builder, inlined introspection guard, idempotent.
 */

import type { Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
	const tables = await db.introspection.getTables();
	return tables.find((t) => t.name === table)?.columns.some((c) => c.name === column) ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
	if (!(await columnExists(db, 'schedule_assignments', 'schedule_id'))) {
		await db.schema.alterTable('schedule_assignments').addColumn('schedule_id', 'text').execute();
	}

	// Backfill per schedule: for each schedule, stamp its id onto every still-null
	// assignment whose student belongs to that schedule. A loop keeps the SQL
	// portable (no correlated UPDATE subquery, which the two engines spell
	// differently).
	const schedules = await db.selectFrom('scheduling_periods').select('id').execute();
	for (const schedule of schedules) {
		if (!schedule.id) continue;
		const studentRows = await db
			.selectFrom('schedule_students')
			.select('student_id')
			.where('schedule_id', '=', schedule.id)
			.execute();
		const studentIds = studentRows.map((r) => r.student_id).filter(Boolean);
		if (studentIds.length === 0) continue;
		await db
			.updateTable('schedule_assignments')
			.set({ schedule_id: schedule.id })
			.where('schedule_id', 'is', null)
			.where('student_id', 'in', studentIds)
			.execute();
	}

	await db.schema
		.createIndex('idx_schedule_assignments_schedule')
		.ifNotExists()
		.on('schedule_assignments')
		.column('schedule_id')
		.execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
	try {
		await db.schema.dropIndex('idx_schedule_assignments_schedule').execute();
	} catch {
		// index may not exist
	}
	// SQLite cannot drop a column without a table rebuild; leave the column in
	// place on rollback (it is nullable and unused once the code reverts).
}
