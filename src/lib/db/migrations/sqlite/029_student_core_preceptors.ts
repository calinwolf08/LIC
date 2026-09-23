import { Kysely, sql } from 'kysely';

/**
 * Migration 029: Student core preceptors
 *
 * Client feedback F5: a student can have one or more "core" preceptors (their
 * continuity preceptors). Assigning the student to a preceptor outside their
 * core set raises a soft, overrideable warning (`outside_core_preceptor`).
 *
 * Core preceptors are a property of the student (global, like onboarding), not
 * schedule-scoped.
 */

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable('student_core_preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('student_core_preceptors_unique', ['student_id', 'preceptor_id'])
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('student_core_preceptors').execute();
}
