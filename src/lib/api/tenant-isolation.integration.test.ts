/**
 * Tenant-isolation regression net (step 26).
 *
 * For every scoped read path, assert that querying as tenant A returns only A's
 * rows and that NONE of B's ids appear anywhere in the result. Asserting on the
 * absence of B's ids (not on A's counts) is deliberate: a count can pass by
 * accident, a leaked id cannot.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { createTwoTenants, tenantMarkerIds, containsNoneOf, type TwoTenants } from '$lib/testing/tenant-fixture';
import {
	requireActiveScheduleId,
	isEntityInSchedule,
	assertEntityInSchedule
} from './schedule-context';
import { NotFoundError, UnauthorizedError, ValidationError } from './errors';
import { getStudentsBySchedule, getStudentsWithOnboardingStatsBySchedule } from '$lib/features/students/services/student-service';
import { getPreceptorsWithAssociationsBySchedule } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkshipsBySchedule } from '$lib/features/clerkships/services/clerkship-service';
import { getCalendarEvents } from '$lib/features/schedules/services/calendar-service';

describe('tenant isolation — scoped reads', () => {
	let db: Kysely<DB>;
	let t: TwoTenants;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		t = await createTwoTenants(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('getStudentsBySchedule returns only A, none of B', async () => {
		const rows = await getStudentsBySchedule(db, t.a.scheduleId);
		expect(rows.map((r) => r.id)).toEqual([t.a.studentId]);
		expect(containsNoneOf(rows, tenantMarkerIds(t.b))).toBe(true);
	});

	it('getStudentsWithOnboardingStatsBySchedule returns only A, none of B', async () => {
		const rows = await getStudentsWithOnboardingStatsBySchedule(db, t.a.scheduleId);
		expect(rows.map((r) => r.id)).toEqual([t.a.studentId]);
		expect(containsNoneOf(rows, tenantMarkerIds(t.b))).toBe(true);
	});

	it('getPreceptorsWithAssociationsBySchedule returns only A, none of B', async () => {
		const rows = await getPreceptorsWithAssociationsBySchedule(db, t.a.scheduleId);
		expect(rows.map((r) => r.id)).toEqual([t.a.preceptorId]);
		expect(containsNoneOf(rows, tenantMarkerIds(t.b))).toBe(true);
	});

	it('getClerkshipsBySchedule returns only A, none of B', async () => {
		const rows = await getClerkshipsBySchedule(db, t.a.scheduleId);
		expect(rows.map((r) => r.id)).toEqual([t.a.clerkshipId]);
		expect(containsNoneOf(rows, tenantMarkerIds(t.b))).toBe(true);
	});

	it('getCalendarEvents returns only A assignments, none of B', async () => {
		const events = await getCalendarEvents(db, {
			scheduleId: t.a.scheduleId,
			start_date: '2026-01-01',
			end_date: '2026-12-31'
		});
		expect(events.map((e) => e.assignment.id)).toEqual([t.a.assignmentId]);
		expect(containsNoneOf(events, tenantMarkerIds(t.b))).toBe(true);
	});
});

describe('tenant isolation — entity boundary helpers', () => {
	let db: Kysely<DB>;
	let t: TwoTenants;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		t = await createTwoTenants(db);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it("isEntityInSchedule is true for own entity, false for another tenant's", async () => {
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'student', t.a.studentId)).toBe(true);
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'student', t.b.studentId)).toBe(false);
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'preceptor', t.b.preceptorId)).toBe(false);
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'site', t.b.siteId)).toBe(false);
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'health_system', t.b.healthSystemId)).toBe(false);
		expect(await isEntityInSchedule(db, t.a.scheduleId, 'clerkship', t.b.clerkshipId)).toBe(false);
	});

	it("assertEntityInSchedule throws NotFoundError for another tenant's entity", async () => {
		await expect(assertEntityInSchedule(db, t.a.scheduleId, 'student', t.b.studentId)).rejects.toBeInstanceOf(NotFoundError);
		await expect(assertEntityInSchedule(db, t.a.scheduleId, 'student', t.a.studentId)).resolves.toBeUndefined();
	});

	it('requireActiveScheduleId resolves the active schedule and rejects bad state', async () => {
		await expect(
			requireActiveScheduleId({ session: { user: { id: t.a.userId } } }, db)
		).resolves.toBe(t.a.scheduleId);
		await expect(requireActiveScheduleId({ session: null }, db)).rejects.toBeInstanceOf(UnauthorizedError);
		// A user with no active_schedule_id set.
		await db.updateTable('user').set({ active_schedule_id: null }).where('id', '=', t.a.userId).execute();
		await expect(
			requireActiveScheduleId({ session: { user: { id: t.a.userId } } }, db)
		).rejects.toBeInstanceOf(ValidationError);
	});
});
