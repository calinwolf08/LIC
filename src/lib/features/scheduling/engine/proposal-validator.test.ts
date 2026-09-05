/**
 * ProposalValidator (Phase 2.2 / F-05, F-11): generated days are validated
 * through the single validator; soft codes are surfaced by default and bypassed
 * codes become override_codes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { ProposalValidator } from './proposal-validator';

const SCHED = 'sched-1';
const STU = 'stu-1';
const HS = 'hs-1';
const SITE = 'site-1';
const CLERK = 'clerk-1';
const PREC = 'prec-1';

async function seed(db: Kysely<DB>, opts: { onboard: boolean }) {
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
		.insertInto('preceptor_availability')
		.values({
			id: 'av-1',
			preceptor_id: PREC,
			site_id: SITE,
			date: '2025-06-02',
			is_available: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	if (opts.onboard) {
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
	}
}

describe('ProposalValidator', () => {
	let db: Kysely<DB>;
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('accepts a fully valid day with no violations', async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db, { onboard: true });
		const v = new ProposalValidator(db, SCHED);
		const d = await v.validate({
			studentId: STU,
			preceptorId: PREC,
			clerkshipId: CLERK,
			date: '2025-06-02'
		});
		expect(d.accepted).toBe(true);
		expect(d.soft).toHaveLength(0);
		expect(d.surfaced).toHaveLength(0);
		expect(d.overrideCodes).toHaveLength(0);
	});

	it('surfaces a soft violation (not_onboarded) by default (F-05)', async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db, { onboard: false });
		const v = new ProposalValidator(db, SCHED);
		const d = await v.validate({
			studentId: STU,
			preceptorId: PREC,
			clerkshipId: CLERK,
			date: '2025-06-02'
		});
		expect(d.accepted).toBe(true); // soft never hard-blocks
		expect(d.surfaced.some((s) => s.code === 'not_onboarded')).toBe(true);
		expect(d.overrideCodes).toHaveLength(0);
	});

	it('records a bypassed soft code as an override instead of a violation (F-11)', async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db, { onboard: false });
		const v = new ProposalValidator(db, SCHED, new Set(['not_onboarded']));
		const d = await v.validate({
			studentId: STU,
			preceptorId: PREC,
			clerkshipId: CLERK,
			date: '2025-06-02'
		});
		expect(d.overrideCodes).toContain('not_onboarded');
		expect(d.surfaced.some((s) => s.code === 'not_onboarded')).toBe(false);
	});
});
