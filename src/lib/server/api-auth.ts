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
