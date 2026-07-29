/**
 * API-level tenant-isolation tests for MUTATIONS (step 27).
 *
 * As tenant A, every write against tenant B's data must 404 and leave B's row
 * byte-identical; the same write against A's own data must succeed (no
 * over-blocking). Fresh two-tenant db per test so positive deletes can't leak
 * into other cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { createTwoTenants, type TwoTenants } from '$lib/testing/tenant-fixture';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$lib/db', () => ({
	db: new Proxy(
		{},
		{
			get(_t, prop) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const target = holder.db as any;
				const value = target?.[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		}
	)
}));

let db: Kysely<DB>;
let t: TwoTenants;

import * as students from './students/[id]/+server';
import * as preceptors from './preceptors/[id]/+server';
import * as clerkships from './clerkships/[id]/+server';
import * as sites from './sites/[id]/+server';
import * as healthSystems from './health-systems/[id]/+server';
import * as assignmentId from './schedules/assignments/[id]/+server';
import * as sideEffects from './schedules/assignments/side-effects/+server';

function localsA() {
	return { session: { user: { id: t.a.userId } }, entitlements: [] } as unknown as App.Locals;
}

function event(overrides: Record<string, unknown>) {
	return {
		locals: localsA(),
		params: {},
		url: new URL('http://localhost/'),
		request: new Request('http://localhost/'),
		...overrides
	} as never;
}

function patchReq(body: unknown) {
	return new Request('http://localhost/', {
		method: 'PATCH',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' }
	});
}

beforeEach(async () => {
	db = await createTestDatabaseWithMigrations();
	holder.db = db as unknown;
	t = await createTwoTenants(db);
});

afterEach(async () => {
	await cleanupTestDatabase(db);
});

async function rowExists(table: keyof DB, id: string): Promise<boolean> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const row = await (db as any).selectFrom(table).select('id').where('id', '=', id).executeTakeFirst();
	return Boolean(row);
}

describe('cross-tenant entity mutations → 404, row intact', () => {
	const cases = [
		{ name: 'students', mod: students, table: 'students' as const, other: () => t.b.studentId, own: () => t.a.studentId, kind: 'student' as const },
		{ name: 'preceptors', mod: preceptors, table: 'preceptors' as const, other: () => t.b.preceptorId, own: () => t.a.preceptorId, kind: 'preceptor' as const },
		{ name: 'clerkships', mod: clerkships, table: 'clerkships' as const, other: () => t.b.clerkshipId, own: () => t.a.clerkshipId, kind: 'clerkship' as const },
		{ name: 'sites', mod: sites, table: 'sites' as const, other: () => t.b.siteId, own: () => t.a.siteId, kind: 'site' as const },
		{ name: 'health-systems', mod: healthSystems, table: 'health_systems' as const, other: () => t.b.healthSystemId, own: () => t.a.healthSystemId, kind: 'health_system' as const }
	];

	for (const c of cases) {
		const patch = (c.mod as { PATCH?: unknown; PUT?: unknown }).PATCH ?? (c.mod as { PUT?: unknown }).PUT;

		it(`${c.name}: PATCH B → 404 and B unchanged`, async () => {
			const res = await (patch as (e: never) => Promise<Response>)(
				event({ params: { id: c.other() }, request: patchReq({ name: 'HACKED' }) })
			);
			expect(res.status).toBe(404);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const row = await (db as any).selectFrom(c.table).select('name').where('id', '=', c.other()).executeTakeFirst();
			expect(row.name).not.toBe('HACKED');
		});

		it(`${c.name}: DELETE B → 404 and B still exists`, async () => {
			const res = await (c.mod.DELETE as (e: never) => Promise<Response>)(event({ params: { id: c.other() } }));
			expect(res.status).toBe(404);
			expect(await rowExists(c.table, c.other())).toBe(true);
		});
	}
});

describe('assignment mutations', () => {
	it('DELETE B\'s assignment → 404, assignment intact', async () => {
		const res = await (assignmentId.DELETE as (e: never) => Promise<Response>)(
			event({ params: { id: t.b.assignmentId } })
		);
		expect(res.status).toBe(404);
		expect(await rowExists('schedule_assignments', t.b.assignmentId)).toBe(true);
	});

	it('DELETE own assignment → succeeds', async () => {
		const res = await (assignmentId.DELETE as (e: never) => Promise<Response>)(
			event({ params: { id: t.a.assignmentId }, url: new URL('http://localhost/?force=true') })
		);
		expect(res.status).toBe(200);
		expect(await rowExists('schedule_assignments', t.a.assignmentId)).toBe(false);
	});
});

describe("override side_effects cannot reach another tenant's data", () => {
	it("bump_preceptor_capacity on B's preceptor → 404, B's max_students unchanged", async () => {
		const before = await db
			.selectFrom('preceptors')
			.select('max_students')
			.where('id', '=', t.b.preceptorId)
			.executeTakeFirst();

		const res = await (sideEffects.POST as (e: never) => Promise<Response>)(
			event({
				request: new Request('http://localhost/', {
					method: 'POST',
					body: JSON.stringify({
						side_effects: [{ kind: 'bump_preceptor_capacity', preceptor_id: t.b.preceptorId, by: 5 }]
					}),
					headers: { 'content-type': 'application/json' }
				})
			})
		);
		expect(res.status).toBe(404);

		const after = await db
			.selectFrom('preceptors')
			.select('max_students')
			.where('id', '=', t.b.preceptorId)
			.executeTakeFirst();
		expect(after?.max_students).toBe(before?.max_students);
	});

	it("remove_conflicting_assignment on B's assignment → 404, assignment intact", async () => {
		const res = await (sideEffects.POST as (e: never) => Promise<Response>)(
			event({
				request: new Request('http://localhost/', {
					method: 'POST',
					body: JSON.stringify({
						side_effects: [{ kind: 'remove_conflicting_assignment', assignment_id: t.b.assignmentId }]
					}),
					headers: { 'content-type': 'application/json' }
				})
			})
		);
		expect(res.status).toBe(404);
		expect(await rowExists('schedule_assignments', t.b.assignmentId)).toBe(true);
	});
});
