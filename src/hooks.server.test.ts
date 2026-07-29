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
	'/api/scheduling-config/requirements',
	'/api/scheduling-config/requirements/some-id',
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
