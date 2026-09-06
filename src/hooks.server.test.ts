/**
 * Central API auth enforcement in the request hook (step 34).
 *
 * The hook is the single 401 gate. We mock better-auth, the DB and
 * `svelteKitHandler` so we can drive `handle` directly and assert that
 * unauthenticated `/api/` requests are rejected BEFORE any route runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('$lib/auth', () => ({ auth: { api: { get getSession() { return getSession; } } } }));
vi.mock('$app/environment', () => ({ building: false }));
// resolve/svelteKitHandler must only run when the request is allowed through.
const resolved = new Response('ok', { status: 200 });
const svelteKitHandler = vi.fn(async (_arg?: unknown) => resolved);
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler: (arg: unknown) => svelteKitHandler(arg) }));
vi.mock('$lib/db', () => ({ db: {} }));

import { handle } from './hooks.server';

const resolve = vi.fn(async () => resolved);

function event(pathname: string) {
	return {
		url: new URL(`http://localhost${pathname}`),
		request: new Request(`http://localhost${pathname}`),
		locals: {} as App.Locals
	} as never;
}

// The previously-unguarded mutating endpoints (Round 4 audit) plus a couple of
// already-guarded ones — all must now be centrally rejected without a session.
const PROTECTED_PATHS = [
	'/api/students',
	'/api/blackout-dates',
	'/api/blackout-dates/some-id',
	'/api/schedules',
	'/api/scheduling-periods',
	'/api/scheduling-config/electives',
	'/api/scheduling-config/electives/some-id',
	'/api/preceptors/some-id/patterns/generate',
	'/api/preceptors/teams/some-id',
	'/api/schedules/assignments'
];

describe('hooks: central API authentication', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(PROTECTED_PATHS)('returns 401 and runs no route for %s with no session', async (path) => {
		getSession.mockResolvedValue(null);
		const res = await handle({ event: event(path), resolve } as never);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual({ success: false, error: { message: 'Authentication required' } });
		// The request never reached the route/resolve.
		expect(resolve).not.toHaveBeenCalled();
		expect(svelteKitHandler).not.toHaveBeenCalled();
	});

	it('lets an authenticated request through to the handler', async () => {
		getSession.mockResolvedValue({ user: { id: 'u1', entitlements: '[]' } });
		const res = await handle({ event: event('/api/students'), resolve } as never);
		expect(res.status).toBe(200);
		expect(svelteKitHandler).toHaveBeenCalledOnce();
	});

	it('never blocks better-auth routes, even without a session', async () => {
		getSession.mockResolvedValue(null);
		const res = await handle({ event: event('/api/auth/sign-in/email'), resolve } as never);
		expect(res.status).toBe(200);
		expect(svelteKitHandler).toHaveBeenCalledOnce();
	});

	it('does not challenge page routes (guarded by their layout)', async () => {
		getSession.mockResolvedValue(null);
		const res = await handle({ event: event('/dashboard'), resolve } as never);
		expect(res.status).toBe(200);
		expect(svelteKitHandler).toHaveBeenCalledOnce();
	});
});

// Stage 2 (autogen) prefixes are rejected centrally with 403 when the caller
// lacks the entitlement, so a new sub-route under them cannot forget the check
// (05 §3). These are all authenticated — the 401 gate above ran first.
const AUTOGEN_PATHS = [
	'/api/schedules/generate',
	'/api/scheduling/execute',
	'/api/scheduling-config/global-defaults/inpatient',
	'/api/scheduling-config/capacity-rules',
	'/api/scheduling-config/capacity-rules/some-id',
	'/api/scheduling-config/fallbacks'
];

describe('hooks: central Stage 2 (autogen) gating', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each(AUTOGEN_PATHS)('returns 403 for %s without the autogen entitlement', async (path) => {
		getSession.mockResolvedValue({ user: { id: 'u1', entitlements: '[]' } });
		const res = await handle({ event: event(path), resolve } as never);
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body).toEqual({
			success: false,
			error: { message: 'Auto-generation requires an upgraded plan' }
		});
		expect(svelteKitHandler).not.toHaveBeenCalled();
	});

	it.each(AUTOGEN_PATHS)('lets an autogen user through to %s', async (path) => {
		getSession.mockResolvedValue({ user: { id: 'u1', entitlements: '["autogen"]' } });
		const res = await handle({ event: event(path), resolve } as never);
		expect(res.status).toBe(200);
		expect(svelteKitHandler).toHaveBeenCalledOnce();
	});

	it('does not gate an open Stage 1 route for a non-autogen user', async () => {
		getSession.mockResolvedValue({ user: { id: 'u1', entitlements: '[]' } });
		const res = await handle({ event: event('/api/scheduling-config/electives'), resolve } as never);
		expect(res.status).toBe(200);
		expect(svelteKitHandler).toHaveBeenCalledOnce();
	});
});
