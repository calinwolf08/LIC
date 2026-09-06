/**
 * Postgres integration smoke — proves the app's real query layer (feature
 * services + tenant guards), not just the schema, runs on PostgreSQL.
 *
 * The migration-equivalence test proves the schema matches across engines and
 * the auth test proves sign-up works on both; this closes the loop by running
 * actual application queries against a real (in-process) Postgres, so a query
 * that happens to rely on SQLite-only behaviour would be caught here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from './types';
import {
	createPostgresTestDatabaseWithMigrations,
	type PostgresTestDb
} from './test-utils.postgres';
import { createTwoTenants, type TwoTenants } from '$lib/testing/tenant-fixture';
import { getStudentsBySchedule } from '$lib/features/students/services/student-service';
import { assertEntityInSchedule } from '$lib/api/schedule-context';
import { NotFoundError } from '$lib/api/errors';
import { getStudentScheduleData } from '$lib/features/schedules/services/schedule-views-service';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';

describe('feature-service queries on PostgreSQL', () => {
	let handle: PostgresTestDb;
	let db: Kysely<DB>;
	let t: TwoTenants;

	beforeAll(async () => {
		handle = await createPostgresTestDatabaseWithMigrations();
		db = handle.db;
		t = await createTwoTenants(db);
	}, 120_000);

	afterAll(async () => {
		await handle?.destroy();
	});

	it('scopes a schedule-scoped list query to the owning tenant', async () => {
		const aStudents = await getStudentsBySchedule(db, t.a.scheduleId);
		const bStudents = await getStudentsBySchedule(db, t.b.scheduleId);

		expect(aStudents.map((s) => s.id)).toContain(t.a.studentId);
		expect(aStudents.map((s) => s.id)).not.toContain(t.b.studentId);
		expect(bStudents.map((s) => s.id)).toContain(t.b.studentId);
	});

	it('enforces the tenant boundary (own resolves, cross-tenant 404s)', async () => {
		await expect(
			assertEntityInSchedule(db, t.a.scheduleId, 'student', t.a.studentId)
		).resolves.toBeUndefined();
		await expect(
			assertEntityInSchedule(db, t.a.scheduleId, 'student', t.b.studentId)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('runs a multi-join read (student schedule view) without SQLite-only SQL', async () => {
		const own = await getStudentScheduleData(db, t.a.studentId, t.a.scheduleId);
		expect(own).not.toBeNull();
		expect(own!.student.id).toBe(t.a.studentId);

		// Cross-tenant student must not resolve.
		const cross = await getStudentScheduleData(db, t.b.studentId, t.a.scheduleId);
		expect(cross).toBeNull();
	});

	// Phase 4.6: exercise the whole scheduling engine against a real Postgres so a
	// generation query that leans on SQLite-only behaviour (integer booleans,
	// COUNT typing, `in` list binding) is caught here rather than in production.
	it('generates and commits assignments on PostgreSQL', async () => {
		// Seed a contiguous run of available days for tenant A's preceptor at its
		// site — enough for the clerkship's 10 required days. The clerkship has no
		// team and no site restriction, so eligibility falls to any scheduled
		// preceptor with availability at an allowed site.
		const ts = '2026-01-01T00:00:00.000Z';
		const avail = [];
		for (let day = 1; day <= 20; day++) {
			const date = `2026-10-${String(day).padStart(2, '0')}`;
			avail.push({
				id: `aavail${String(day).padStart(2, '0')}0000000000000000`.slice(0, 24),
				preceptor_id: t.a.preceptorId,
				site_id: t.a.siteId,
				date,
				is_available: 1,
				created_at: ts,
				updated_at: ts
			});
		}
		await db.insertInto('preceptor_availability').values(avail).execute();

		const engine = new ConfigurableSchedulingEngine(db);
		const result = await engine.schedule([t.a.studentId], [t.a.clerkshipId], {
			startDate: '2026-10-01',
			endDate: '2026-10-31',
			scheduleId: t.a.scheduleId
		});

		expect(result.assignments.length).toBeGreaterThan(0);
		expect(result.assignments.every((a) => a.studentId === t.a.studentId)).toBe(true);

		// The engine commits generated rows, stamped with the schedule id (F-02/F-14).
		const committed = await db
			.selectFrom('schedule_assignments')
			.select(['id', 'schedule_id', 'student_id', 'source'])
			.where('student_id', '=', t.a.studentId)
			.where('schedule_id', '=', t.a.scheduleId)
			.where('source', '=', 'generated')
			.execute();
		expect(committed.length).toBeGreaterThan(0);
	});
});
