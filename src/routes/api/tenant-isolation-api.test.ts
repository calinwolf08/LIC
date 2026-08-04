/**
 * API-level tenant-isolation tests (step 26).
 *
 * Detail GET endpoints must return 404 (never 403, never the row) when asked
 * for an entity that belongs to another tenant. We mock `$lib/db` with an
 * in-memory two-tenant database and drive the real route handlers.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { createTwoTenants, type TwoTenants } from '$lib/testing/tenant-fixture';

// A mutable holder the mock forwards through, so the in-memory db (created in
// beforeAll) is what every route and service sees as the singleton `db`. Uses a
// lazy Proxy: singletons that capture `db` at import time (e.g. siteService)
// still resolve to the real db when their methods are finally called.
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

// Import handlers AFTER the mock is registered.
import * as students from './students/[id]/+server';
import * as preceptors from './preceptors/[id]/+server';
import * as clerkships from './clerkships/[id]/+server';
import * as sites from './sites/[id]/+server';
import * as healthSystems from './health-systems/[id]/+server';

function asTenantA() {
	return { session: { user: { id: t.a.userId } }, entitlements: [] } as unknown as App.Locals;
}

function event(id: string) {
	return {
		locals: asTenantA(),
		params: { id },
		url: new URL('http://localhost/'),
		request: new Request('http://localhost/')
	} as never;
}

beforeAll(async () => {
	db = await createTestDatabaseWithMigrations();
	holder.db = db as unknown;
	t = await createTwoTenants(db);
});

afterAll(async () => {
	await cleanupTestDatabase(db);
});

describe('detail GET endpoints — cross-tenant returns 404', () => {
	const cases: Array<{ name: string; get: (id: string) => Promise<Response> | Response; own: () => string; other: () => string }> = [
		{ name: 'students', get: (id) => students.GET(event(id)), own: () => t.a.studentId, other: () => t.b.studentId },
		{ name: 'preceptors', get: (id) => preceptors.GET(event(id)), own: () => t.a.preceptorId, other: () => t.b.preceptorId },
		{ name: 'clerkships', get: (id) => clerkships.GET(event(id)), own: () => t.a.clerkshipId, other: () => t.b.clerkshipId },
		{ name: 'sites', get: (id) => sites.GET(event(id)), own: () => t.a.siteId, other: () => t.b.siteId },
		{ name: 'health-systems', get: (id) => healthSystems.GET(event(id)), own: () => t.a.healthSystemId, other: () => t.b.healthSystemId }
	];

	for (const c of cases) {
		it(`${c.name}: A sees own entity (200)`, async () => {
			const res = await c.get(c.own());
			expect(res.status).toBe(200);
		});

		it(`${c.name}: A gets 404 for B's entity, and B's id does not leak`, async () => {
			const res = await c.get(c.other());
			expect(res.status).toBe(404);
			const body = await res.text();
			expect(body).not.toContain(c.other());
		});
	}
});
