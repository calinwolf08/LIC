/**
 * Tenant isolation for scheduling-config ownership (step 35). Config rows are
 * owned via their parent entity (elective → clerkship; capacity rule / fallback
 * → preceptor). Asserting as tenant A against tenant B's config must 404.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { createTwoTenants, type TwoTenants } from '$lib/testing/tenant-fixture';
import {
	assertElectiveInSchedule,
	assertCapacityRuleInSchedule,
	assertFallbackInSchedule
} from './schedule-context';
import { NotFoundError } from './errors';
import { getStudentScheduleData } from '$lib/features/schedules/services/schedule-views-service';

const ts = '2026-01-01T00:00:00.000Z';

async function seedConfig(db: Kysely<DB>, key: string, preceptorId: string, clerkshipId: string) {
	const id = (s: string) => `${key}-${s}`;
	// A second preceptor so the fallback has a distinct primary/fallback.
	await db
		.insertInto('preceptors')
		.values({
			id: id('prec2'),
			name: `${key} Prec2`,
			email: `${key}-prec2@x.com`,
			max_students: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('clerkship_electives')
		.values({
			id: id('elective'),
			clerkship_id: clerkshipId,
			name: `${key} Elective`,
			minimum_days: 3,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('preceptor_capacity_rules')
		.values({
			id: id('caprule'),
			preceptor_id: preceptorId,
			max_students_per_day: 1,
			max_students_per_year: 10,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('preceptor_fallbacks')
		.values({
			id: id('fallback'),
			primary_preceptor_id: preceptorId,
			fallback_preceptor_id: id('prec2'),
			created_at: ts,
			updated_at: ts
		})
		.execute();
	return { electiveId: id('elective'), capRuleId: id('caprule'), fallbackId: id('fallback') };
}

describe('scheduling-config ownership guards', () => {
	let db: Kysely<DB>;
	let t: TwoTenants;
	let a: Awaited<ReturnType<typeof seedConfig>>;
	let b: Awaited<ReturnType<typeof seedConfig>>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		t = await createTwoTenants(db);
		a = await seedConfig(db, 'a', t.a.preceptorId, t.a.clerkshipId);
		b = await seedConfig(db, 'b', t.b.preceptorId, t.b.clerkshipId);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('assertElectiveInSchedule: own resolves, cross-tenant 404s', async () => {
		await expect(assertElectiveInSchedule(db, t.a.scheduleId, a.electiveId)).resolves.toBeUndefined();
		await expect(assertElectiveInSchedule(db, t.a.scheduleId, b.electiveId)).rejects.toBeInstanceOf(NotFoundError);
		await expect(assertElectiveInSchedule(db, t.a.scheduleId, 'no-such-id')).rejects.toBeInstanceOf(NotFoundError);
	});

	it('assertCapacityRuleInSchedule: own resolves, cross-tenant 404s', async () => {
		await expect(assertCapacityRuleInSchedule(db, t.a.scheduleId, a.capRuleId)).resolves.toBeUndefined();
		await expect(assertCapacityRuleInSchedule(db, t.a.scheduleId, b.capRuleId)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('assertFallbackInSchedule: own resolves, cross-tenant 404s', async () => {
		await expect(assertFallbackInSchedule(db, t.a.scheduleId, a.fallbackId)).resolves.toBeUndefined();
		await expect(assertFallbackInSchedule(db, t.a.scheduleId, b.fallbackId)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('getStudentScheduleData tenant scoping', () => {
	let db: Kysely<DB>;
	let t: TwoTenants;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		t = await createTwoTenants(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it("returns null for another tenant's student (no name/email disclosure)", async () => {
		const result = await getStudentScheduleData(db, t.b.studentId, t.a.scheduleId);
		expect(result).toBeNull();
	});

	it('returns the payload for own student, with only own clerkships', async () => {
		const result = await getStudentScheduleData(db, t.a.studentId, t.a.scheduleId);
		expect(result).not.toBeNull();
		expect(result!.student.name).toBe('Tenant A Student');
		// The progress breakdown must not include tenant B's clerkship.
		const clerkshipIds = result!.clerkshipProgress.map((c) => c.clerkshipId);
		expect(clerkshipIds).toContain(t.a.clerkshipId);
		expect(clerkshipIds).not.toContain(t.b.clerkshipId);
	});

	it('returns null when there is no active schedule', async () => {
		expect(await getStudentScheduleData(db, t.a.studentId, null)).toBeNull();
	});
});
