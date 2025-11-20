import { Kysely, sql } from 'kysely';

/**
 * Student Health System Onboarding Migration
 *
 * Creates table to track student onboarding completion per health system.
 * Students must complete onboarding before being assigned to a preceptor
 * at that health system.
 */

export async function up(db: Kysely<any>): Promise<void> {
	// Create student_health_system_onboarding table
	await db.schema
		.createTable('student_health_system_onboarding')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('student_id', 'text', (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('health_system_id', 'text', (col) =>
			col.notNull().references('health_systems.id').onDelete('cascade')
		)
		.addColumn('is_completed', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('completed_date', 'text')
		.addColumn('notes', 'text')
		.addColumn('created_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.addColumn('updated_at', 'text', (col) =>
			col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
		)
		.execute();

	// Create unique constraint on student_id and health_system_id
	await db.schema
		.createIndex('idx_student_health_system_unique')
		.on('student_health_system_onboarding')
		.columns(['student_id', 'health_system_id'])
		.unique()
		.execute();

	// Create indexes for efficient lookups
	await db.schema
		.createIndex('idx_student_onboarding_student')
		.on('student_health_system_onboarding')
		.column('student_id')
		.execute();

	await db.schema
		.createIndex('idx_student_onboarding_health_system')
		.on('student_health_system_onboarding')
		.column('health_system_id')
		.execute();

	await db.schema
		.createIndex('idx_student_onboarding_completed')
		.on('student_health_system_onboarding')
		.column('is_completed')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('student_health_system_onboarding').execute();
}
