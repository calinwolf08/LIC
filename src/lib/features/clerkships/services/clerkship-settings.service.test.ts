import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { ClerkshipSettingsService } from './clerkship-settings.service';

const CLERK = 'clerk-1';
const ELECTIVE = 'elec-1';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERK,
			name: 'Med',
			clerkship_type: 'outpatient',
			required_days: 20,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	// The migrations seed a `default` row for each global-defaults table; set the
	// values this test asserts against.
	await db
		.updateTable('global_outpatient_defaults')
		.set({
			assignment_strategy: 'continuous_single',
			health_system_rule: 'no_preference',
			default_max_students_per_day: 2,
			default_max_students_per_year: 30,
			allow_teams: 0,
			allow_fallbacks: 1,
			fallback_requires_approval: 0,
			fallback_allow_cross_system: 0,
			updated_at: ts
		})
		.where('school_id', '=', 'default')
		.execute();
	await db
		.updateTable('global_elective_defaults')
		.set({
			assignment_strategy: 'daily_rotation',
			health_system_rule: 'no_preference',
			default_max_students_per_day: 1,
			default_max_students_per_year: 10,
			allow_teams: 0,
			allow_fallbacks: 1,
			fallback_requires_approval: 0,
			fallback_allow_cross_system: 0,
			updated_at: ts
		})
		.where('school_id', '=', 'default')
		.execute();
}

describe('ClerkshipSettingsService', () => {
	let db: Kysely<DB>;
	let service: ClerkshipSettingsService;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
		service = new ClerkshipSettingsService(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('returns global defaults when the clerkship inherits', async () => {
		const settings = await service.getClerkshipSettings(CLERK);
		expect(settings.overrideMode).toBe('inherit');
		expect(settings.assignmentStrategy).toBe('continuous_single');
		expect(settings.maxStudentsPerDay).toBe(2);
	});

	it('applies per-clerkship overrides (F-08)', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('clerkship_configurations')
			.values({
				id: 'cc-1',
				clerkship_id: CLERK,
				override_mode: 'override',
				override_assignment_strategy: 'block_based',
				override_block_size_days: 5,
				override_max_students_per_day: 4,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const settings = await service.getClerkshipSettings(CLERK);
		expect(settings.overrideMode).toBe('override');
		expect(settings.assignmentStrategy).toBe('block_based');
		expect(settings.blockSizeDays).toBe(5);
		expect(settings.maxStudentsPerDay).toBe(4);
		// Unset override falls back to the global default.
		expect(settings.maxStudentsPerYear).toBe(30);
	});

	it('resolves elective settings from global elective defaults (F-10)', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('clerkship_electives')
			.values({
				id: ELECTIVE,
				clerkship_id: CLERK,
				name: 'Cardiology',
				minimum_days: 5,
				is_required: 1,
				override_mode: 'inherit',
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const settings = await service.getElectiveSettings(ELECTIVE);
		expect(settings.overrideMode).toBe('inherit');
		// Elective inherits the elective defaults, NOT the parent clerkship's.
		expect(settings.assignmentStrategy).toBe('daily_rotation');
		expect(settings.maxStudentsPerDay).toBe(1);
	});

	it('applies per-elective overrides (F-10)', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('clerkship_electives')
			.values({
				id: ELECTIVE,
				clerkship_id: CLERK,
				name: 'Cardiology',
				minimum_days: 5,
				is_required: 1,
				override_mode: 'override',
				override_assignment_strategy: 'block_based',
				override_max_students_per_day: 3,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const settings = await service.getElectiveSettings(ELECTIVE);
		expect(settings.overrideMode).toBe('override');
		expect(settings.assignmentStrategy).toBe('block_based');
		expect(settings.maxStudentsPerDay).toBe(3);
		// Unset override falls back to the elective default.
		expect(settings.maxStudentsPerYear).toBe(10);
	});
});
