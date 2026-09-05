/**
 * planRegeneration (Phase 2.3 / F-12): one classification of keep-vs-delete used
 * by both preview and apply, so they cannot disagree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { planRegeneration } from './regeneration-service';

const SCHED = 'sched-1';
const STU = 'stu-1';
const HS = 'hs-1';
const SITE = 'site-1';
const CLERK = 'clerk-1';
const PREC = 'prec-1';
const CUTOFF = '2025-06-01';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHED,
			name: 'Demo',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values({ id: STU, name: 'Stu', email: 's@x.com', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: HS, name: 'HS', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({ id: SITE, name: 'Site', health_system_id: HS, created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERK,
			name: 'Med',
			clerkship_type: 'outpatient',
			required_days: 10,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: PREC,
			name: 'P',
			email: 'p@x.com',
			max_students: 1,
			health_system_id: HS,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('student_health_system_onboarding')
		.values({
			id: 'onb-1',
			student_id: STU,
			health_system_id: HS,
			is_completed: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	// A valid future day requires the preceptor to be available; an invalid one
	// has an explicit is_available = 0 row.
	await db
		.insertInto('preceptor_availability')
		.values([
			{
				id: 'av-valid',
				preceptor_id: PREC,
				site_id: SITE,
				date: '2025-07-01',
				is_available: 1,
				created_at: ts,
				updated_at: ts
			},
			{
				id: 'av-invalid',
				preceptor_id: PREC,
				site_id: SITE,
				date: '2025-07-02',
				is_available: 0,
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();

	// Four assignments: past, locked future, valid future, invalid future.
	const mk = (id: string, date: string, locked: number, siteId: string | null) => ({
		id,
		schedule_id: SCHED,
		student_id: STU,
		preceptor_id: PREC,
		clerkship_id: CLERK,
		site_id: siteId,
		date,
		status: 'scheduled',
		locked,
		source: 'generated',
		override_codes: '[]',
		created_at: ts,
		updated_at: ts
	});
	await db
		.insertInto('schedule_assignments')
		.values([
			mk('a-past', '2025-05-01', 0, SITE),
			mk('a-locked', '2025-07-10', 1, SITE),
			mk('a-valid', '2025-07-01', 0, SITE),
			mk('a-invalid', '2025-07-02', 0, SITE)
		])
		.execute();
}

describe('planRegeneration', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('full-reoptimize keeps past + locked, deletes all unlocked future', async () => {
		const plan = await planRegeneration(db, SCHED, { cutoff: CUTOFF, strategy: 'full-reoptimize' });
		expect(plan.keepIds.sort()).toEqual(['a-locked', 'a-past']);
		expect(plan.deleteIds.sort()).toEqual(['a-invalid', 'a-valid']);
		expect(plan.summary.preservedPast).toBe(1);
		expect(plan.summary.preservedLocked).toBe(1);
		expect(plan.summary.deletedFuture).toBe(2);
	});

	it('minimal-change keeps valid future, deletes only invalid future (F-12)', async () => {
		const plan = await planRegeneration(db, SCHED, { cutoff: CUTOFF, strategy: 'minimal-change' });
		expect(plan.keepIds.sort()).toEqual(['a-locked', 'a-past', 'a-valid']);
		expect(plan.deleteIds).toEqual(['a-invalid']);
		expect(plan.summary.preservedFuture).toBe(1);
		expect(plan.summary.deletedFuture).toBe(1);
	});

	it('completion keeps everything', async () => {
		const plan = await planRegeneration(db, SCHED, { cutoff: CUTOFF, strategy: 'completion' });
		expect(plan.deleteIds).toHaveLength(0);
		expect(plan.keepIds).toHaveLength(4);
	});
});
