/**
 * Central API authentication policy (Round 4, step 34).
 *
 * `hooks.server.ts` resolves the session but historically never rejected, so
 * routes that forgot to check `locals` were reachable unauthenticated. This
 * module owns the single default-deny allowlist the hook enforces: any request
 * under `/api/` that is not on the public list requires a session.
 */

/**
 * Exact path prefixes that are reachable without a session. Keep this list
 * small and explicit — the default is deny. Everything else under `/api/`
 * requires authentication.
 *
 * - `/api/auth/` — owned by better-auth (sign-in, sign-up, session, callbacks).
 */
export const PUBLIC_API_PREFIXES = ['/api/auth/'] as const;

/** True when `pathname` is an `/api/` route that anyone may call without a session. */
export function isPublicApiPath(pathname: string): boolean {
	return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Whether a request must be challenged with 401. True for any `/api/` request
 * that is not public and carries no session. Page routes are handled by their
 * layout guard, so only `/api/` paths are considered here.
 *
 * `pathname.startsWith('/api/')` matches only paths that BEGIN with `/api/`, so
 * an unrelated route that merely contains `/api/` later in the string (e.g.
 * `/dashboard/api/x`) is never treated as an API route, and a non-public API
 * path that contains `/api/auth/` later (e.g. `/api/students/api/auth`) is not
 * treated as public.
 */
export function requiresApiAuthChallenge(pathname: string, hasSession: boolean): boolean {
	if (hasSession) return false;
	if (!pathname.startsWith('/api/')) return false;
	return !isPublicApiPath(pathname);
}

/**
 * `/api/` prefixes that require the Stage 2 `autogen` entitlement for EVERY
 * method (05 §3, findings G-1/G-3). These routes are engine-only end to end —
 * their handlers already call `requireAutogen` on every verb, so gating the
 * whole prefix in the hook adds a single default-deny enforcement point a new
 * sub-route cannot forget, while the handler checks stay as defence in depth.
 *
 * Routes that must stay open to Stage 1 for reads but gated for writes (e.g.
 * elective preceptor pools) are NOT listed here — they gate per-method in the
 * handler, because a prefix rule cannot distinguish GET from POST.
 */
export const AUTOGEN_API_PREFIXES = [
	'/api/schedules/generate',
	'/api/scheduling/',
	'/api/generate/',
	'/api/scheduling-config/global-defaults/',
	'/api/scheduling-config/capacity-rules/',
	'/api/scheduling-config/fallbacks/'
] as const;

/**
 * True when `pathname` is an `/api/` route reserved for Stage 2 (auto-generation)
 * users. The hook rejects these with 403 when the caller lacks `autogen`.
 */
export function requiresAutogenEntitlement(pathname: string): boolean {
	if (!pathname.startsWith('/api/')) return false;
	return AUTOGEN_API_PREFIXES.some((prefix) => {
		// A prefix ending in `/` also gates its collection root (the path without
		// the trailing slash), so `/capacity-rules` is covered by `/capacity-rules/`.
		if (prefix.endsWith('/') && pathname === prefix.slice(0, -1)) return true;
		return pathname.startsWith(prefix);
	});
}
