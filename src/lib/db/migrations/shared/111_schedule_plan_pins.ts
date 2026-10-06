import { sql, PostgresAdapter, type Kysely } from 'kysely';

/**
 * Migration 111 (shared): schedule_plan_pins — the manual planner's draft layer (L4).
 *
 * A "pin" is a tentative assignment a coordinator stages while planning. Pins are
 * NOT assignments: they live in their own table, scoped to (schedule_id, user_id),
 * so one coordinator's draft never touches the real schedule or another user's draft
 * until the pin set is committed (which turns valid pins into schedule_assignments
 * through the same validator as manual create).
 *
 * The columns mirror a clinical/non-clinical assignment so a pin can be evaluated by
 * the exact same rules (session, kind, credit, override_codes). There is deliberately
 * NO unique(student, date): the whole point is to let a coordinator stage a clashing
 * pin and SEE the conflict before committing.
 *
 * Shared migration rules (see ../shared/README.md): import only from 'kysely',
 * dialect-agnostic builder, booleans/text (no boolean/timestamptz), idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tableExists(db: Kysely<any>, table: string): Promise<boolean> {
	const tables = await db.introspection.getTables();
	return tables.some((t) => t.name === table);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
	if (await tableExists(db, 'schedule_plan_pins')) return;

	const isPg = db.getExecutor().adapter instanceof PostgresAdapter;
	const nowText = isPg
		? sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`
		: sql`CURRENT_TIMESTAMP`;

	await db.schema
		.createTable('schedule_plan_pins')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		// The coordinator who owns this draft. Plain text (no FK): user rows are not
		// in scope here and distributions use the same convention.
		.addColumn('user_id', 'text', (col) => col.notNull())
		.addColumn('student_id', 'text', (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		// Nullable for a non-clinical (free_day / exam) or standalone-elective pin.
		.addColumn('preceptor_id', 'text', (col) => col.references('preceptors.id').onDelete('cascade'))
		.addColumn('clerkship_id', 'text', (col) => col.references('clerkships.id').onDelete('cascade'))
		.addColumn('site_id', 'text', (col) => col.references('sites.id').onDelete('cascade'))
		// The optional elective a clinical pin satisfies. Plain text: electives are
		// validated against the clerkship at commit, like manual create.
		.addColumn('elective_id', 'text')
		.addColumn('date', 'text', (col) => col.notNull())
		.addColumn('session', 'text', (col) =>
			col.notNull().defaultTo('full').check(sql`session IN ('full', 'am', 'pm')`)
		)
		.addColumn('kind', 'text', (col) =>
			col.notNull().defaultTo('clinical').check(sql`kind IN ('clinical', 'free_day', 'exam')`)
		)
		.addColumn('credit_value', 'real', (col) => col.notNull().defaultTo(1))
		// Soft codes the coordinator has chosen to accept for this pin, as a JSON array
		// string (same shape as schedule_assignments.override_codes).
		.addColumn('override_codes', 'text', (col) => col.notNull().defaultTo('[]'))
		.addColumn('override_note', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.execute();

	// The dry-run reads a whole draft at once: one index on (schedule, user).
	await db.schema
		.createIndex('idx_schedule_plan_pins_schedule_user')
		.ifNotExists()
		.on('schedule_plan_pins')
		.columns(['schedule_id', 'user_id'])
		.execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('schedule_plan_pins').ifExists().execute();
}
