/**
 * Two-tenant fixture for tenant-isolation tests.
 *
 * Creates two independent accounts (A and B), each with its own schedule and a
 * full set of entities — student, preceptor, clerkship, site, health system —
 * wired to that schedule through the `schedule_*` junctions, plus one
 * assignment. Every id is namespaced by the tenant key so a leak is obvious:
 * if a query scoped to A ever returns a `b-*` id, the boundary is broken.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface TenantIds {
	key: string;
	userId: string;
	email: string;
	scheduleId: string;
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	siteId: string;
	healthSystemId: string;
	assignmentId: string;
}

const ts = '2026-01-01T00:00:00.000Z';

export async function createTenant(db: Kysely<DB>, key: string): Promise<TenantIds> {
	// Ids must satisfy the API id schemas (cuid2/nanoid/uuid) so the detail
	// endpoints reach the tenant check instead of rejecting on format. Produce a
	// 24-char, letter-leading, alphanumeric id that still embeds the tenant key
	// and entity name so a leak is human-readable.
	const id = (suffix: string) =>
		(`${key}${suffix}`.replace(/[^a-z0-9]/gi, '') + '0000000000000000000000000000').slice(0, 24);
	const email = `${key}@example.com`;

	await db
		.insertInto('user')
		.values({
			id: id('user'),
			name: `Tenant ${key.toUpperCase()}`,
			email,
			emailVerified: 0,
			createdAt: ts,
			updatedAt: ts,
			active_schedule_id: id('sched')
		})
		.execute();

	await db
		.insertInto('scheduling_periods')
		.values({
			id: id('sched'),
			name: `Tenant ${key.toUpperCase()} Schedule`,
			start_date: '2026-01-01',
			end_date: '2026-12-31',
			user_id: id('user'),
			created_at: ts,
			updated_at: ts
		})
		.execute();

	await db
		.insertInto('health_systems')
		.values({ id: id('hs'), name: `Tenant ${key.toUpperCase()} HS`, created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({
			id: id('site'),
			name: `Tenant ${key.toUpperCase()} Site`,
			health_system_id: id('hs'),
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values({
			id: id('student'),
			name: `Tenant ${key.toUpperCase()} Student`,
			email: `${key}-student@x.com`,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: id('prec'),
			name: `Tenant ${key.toUpperCase()} Preceptor`,
			email: `${key}-prec@x.com`,
			max_students: 2,
			health_system_id: id('hs'),
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: id('clerk'),
			name: `Tenant ${key.toUpperCase()} Clerkship`,
			clerkship_type: 'outpatient',
			required_days: 10,
			created_at: ts,
			updated_at: ts
		})
		.execute();

	// Junctions.
	await db
		.insertInto('schedule_students')
		.values({ id: id('js'), schedule_id: id('sched'), student_id: id('student'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values({ id: id('jc'), schedule_id: id('sched'), clerkship_id: id('clerk'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_health_systems')
		.values({ id: id('jhs'), schedule_id: id('sched'), health_system_id: id('hs'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values({ id: id('jp'), schedule_id: id('sched'), preceptor_id: id('prec'), created_at: ts })
		.execute();
	await db
		.insertInto('schedule_sites')
		.values({ id: id('jst'), schedule_id: id('sched'), site_id: id('site'), created_at: ts })
		.execute();

	await db
		.insertInto('schedule_assignments')
		.values({
			id: id('asg'),
			schedule_id: id('sched'),
			student_id: id('student'),
			preceptor_id: id('prec'),
			clerkship_id: id('clerk'),
			site_id: id('site'),
			date: '2026-06-15',
			created_at: ts,
			updated_at: ts
		})
		.execute();

	return {
		key,
		userId: id('user'),
		email,
		scheduleId: id('sched'),
		studentId: id('student'),
		preceptorId: id('prec'),
		clerkshipId: id('clerk'),
		siteId: id('site'),
		healthSystemId: id('hs'),
		assignmentId: id('asg')
	};
}

export interface TwoTenants {
	a: TenantIds;
	b: TenantIds;
}

/** Create tenants A and B in the given migrated database. */
export async function createTwoTenants(db: Kysely<DB>): Promise<TwoTenants> {
	const a = await createTenant(db, 'a');
	const b = await createTenant(db, 'b');
	return { a, b };
}

/** All of a tenant's entity ids as a flat array — handy for "none of B's ids appear" asserts. */
export function tenantMarkerIds(t: TenantIds): string[] {
	return [
		t.userId,
		t.scheduleId,
		t.studentId,
		t.preceptorId,
		t.clerkshipId,
		t.siteId,
		t.healthSystemId,
		t.assignmentId
	];
}

/** True when no id from `other` appears anywhere in `value` (deep, stringified). */
export function containsNoneOf(value: unknown, ids: string[]): boolean {
	const haystack = JSON.stringify(value ?? null);
	return !ids.some((id) => haystack.includes(id));
}
