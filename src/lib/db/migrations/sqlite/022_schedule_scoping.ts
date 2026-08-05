/**
 * Migration 022: Schedule Scoping
 *
 * Adds junction tables for multi-schedule support, allowing entities
 * (students, preceptors, sites, health systems, clerkships, teams, configurations)
 * to be associated with multiple schedules.
 *
 * Also adds a year column to scheduling_periods and migrates existing data
 * to a default schedule.
 */

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// Add year column to scheduling_periods
	await db.schema
		.alterTable('scheduling_periods')
		.addColumn('year', 'integer')
		.execute();

	// Create schedule_students junction table
	await db.schema
		.createTable('schedule_students')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('student_id', 'text', (col) =>
			col.notNull().references('students.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_students_unique', ['schedule_id', 'student_id'])
		.execute();

	// Create schedule_preceptors junction table
	await db.schema
		.createTable('schedule_preceptors')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('preceptor_id', 'text', (col) =>
			col.notNull().references('preceptors.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_preceptors_unique', ['schedule_id', 'preceptor_id'])
		.execute();

	// Create schedule_sites junction table
	await db.schema
		.createTable('schedule_sites')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('site_id', 'text', (col) =>
			col.notNull().references('sites.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_sites_unique', ['schedule_id', 'site_id'])
		.execute();

	// Create schedule_health_systems junction table
	await db.schema
		.createTable('schedule_health_systems')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('health_system_id', 'text', (col) =>
			col.notNull().references('health_systems.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_health_systems_unique', ['schedule_id', 'health_system_id'])
		.execute();

	// Create schedule_clerkships junction table
	await db.schema
		.createTable('schedule_clerkships')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('clerkship_id', 'text', (col) =>
			col.notNull().references('clerkships.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_clerkships_unique', ['schedule_id', 'clerkship_id'])
		.execute();

	// Create schedule_teams junction table
	await db.schema
		.createTable('schedule_teams')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('team_id', 'text', (col) =>
			col.notNull().references('preceptor_teams.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_teams_unique', ['schedule_id', 'team_id'])
		.execute();

	// Create schedule_configurations junction table
	await db.schema
		.createTable('schedule_configurations')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('schedule_id', 'text', (col) =>
			col.notNull().references('scheduling_periods.id').onDelete('cascade')
		)
		.addColumn('configuration_id', 'text', (col) =>
			col.notNull().references('clerkship_configurations.id').onDelete('cascade')
		)
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
		.addUniqueConstraint('schedule_configurations_unique', ['schedule_id', 'configuration_id'])
		.execute();

	// Create indexes for better query performance
	await db.schema
		.createIndex('idx_schedule_students_schedule')
		.on('schedule_students')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_students_student')
		.on('schedule_students')
		.column('student_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_preceptors_schedule')
		.on('schedule_preceptors')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_preceptors_preceptor')
		.on('schedule_preceptors')
		.column('preceptor_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_sites_schedule')
		.on('schedule_sites')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_health_systems_schedule')
		.on('schedule_health_systems')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_clerkships_schedule')
		.on('schedule_clerkships')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_teams_schedule')
		.on('schedule_teams')
		.column('schedule_id')
		.execute();

	await db.schema
		.createIndex('idx_schedule_configurations_schedule')
		.on('schedule_configurations')
		.column('schedule_id')
		.execute();

	// Migrate existing data: link all entities to existing active schedule (if any)
	// or create a default schedule for current year
	const existingSchedule = await db
		.selectFrom('scheduling_periods')
		.select(['id', 'start_date'])
		.where('is_active', '=', 1)
		.executeTakeFirst();

	let scheduleId: string;
	const currentYear = new Date().getFullYear();

	if (existingSchedule) {
		scheduleId = existingSchedule.id!;
		// Update the year based on start_date
		const scheduleYear = new Date(existingSchedule.start_date).getFullYear();
		await db
			.updateTable('scheduling_periods')
			.set({ year: scheduleYear })
			.where('id', '=', scheduleId)
			.execute();
	} else {
		// Create a default schedule for current year
		scheduleId = `default-${currentYear}`;
		await db
			.insertInto('scheduling_periods')
			.values({
				id: scheduleId,
				name: `${currentYear} Schedule`,
				start_date: `${currentYear}-01-01`,
				end_date: `${currentYear}-12-31`,
				year: currentYear,
				is_active: 1,
				created_at: sql`CURRENT_TIMESTAMP`,
				updated_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing students to the schedule
	const students = await db.selectFrom('students').select('id').execute();
	for (const student of students) {
		await db
			.insertInto('schedule_students')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				student_id: student.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing preceptors to the schedule
	const preceptors = await db.selectFrom('preceptors').select('id').execute();
	for (const preceptor of preceptors) {
		await db
			.insertInto('schedule_preceptors')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				preceptor_id: preceptor.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing sites to the schedule
	const sites = await db.selectFrom('sites').select('id').execute();
	for (const site of sites) {
		await db
			.insertInto('schedule_sites')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				site_id: site.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing health systems to the schedule
	const healthSystems = await db.selectFrom('health_systems').select('id').execute();
	for (const hs of healthSystems) {
		await db
			.insertInto('schedule_health_systems')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				health_system_id: hs.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing clerkships to the schedule
	const clerkships = await db.selectFrom('clerkships').select('id').execute();
	for (const clerkship of clerkships) {
		await db
			.insertInto('schedule_clerkships')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				clerkship_id: clerkship.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing teams to the schedule
	const teams = await db.selectFrom('preceptor_teams').select('id').execute();
	for (const team of teams) {
		await db
			.insertInto('schedule_teams')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				team_id: team.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}

	// Link all existing configurations to the schedule
	const configurations = await db.selectFrom('clerkship_configurations').select('id').execute();
	for (const config of configurations) {
		await db
			.insertInto('schedule_configurations')
			.values({
				id: sql`lower(hex(randomblob(10)))`,
				schedule_id: scheduleId,
				configuration_id: config.id,
				created_at: sql`CURRENT_TIMESTAMP`,
			})
			.execute();
	}
}

export async function down(db: Kysely<any>): Promise<void> {
	// Drop indexes
	await db.schema.dropIndex('idx_schedule_configurations_schedule').execute();
	await db.schema.dropIndex('idx_schedule_teams_schedule').execute();
	await db.schema.dropIndex('idx_schedule_clerkships_schedule').execute();
	await db.schema.dropIndex('idx_schedule_health_systems_schedule').execute();
	await db.schema.dropIndex('idx_schedule_sites_schedule').execute();
	await db.schema.dropIndex('idx_schedule_preceptors_preceptor').execute();
	await db.schema.dropIndex('idx_schedule_preceptors_schedule').execute();
	await db.schema.dropIndex('idx_schedule_students_student').execute();
	await db.schema.dropIndex('idx_schedule_students_schedule').execute();

	// Drop junction tables
	await db.schema.dropTable('schedule_configurations').execute();
	await db.schema.dropTable('schedule_teams').execute();
	await db.schema.dropTable('schedule_clerkships').execute();
	await db.schema.dropTable('schedule_health_systems').execute();
	await db.schema.dropTable('schedule_sites').execute();
	await db.schema.dropTable('schedule_preceptors').execute();
	await db.schema.dropTable('schedule_students').execute();

	// Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
	// For simplicity, we'll leave the year column in place during rollback
}
