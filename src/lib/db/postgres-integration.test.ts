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
});
