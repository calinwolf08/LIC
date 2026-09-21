import { auth } from '$lib/auth'; // path to your auth file
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { json, type Handle } from '@sveltejs/kit';
import { parseEntitlements } from '$lib/server/entitlements';
import { requiresApiAuthChallenge, requiresAutogenEntitlement } from '$lib/server/api-auth';
import { ENTITLEMENT_AUTOGEN } from '$lib/server/entitlements';
import { db } from '$lib/db';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session;

	// Resolve entitlements from the DB (source of truth). Falls back to the
	// value on the session user if present, then to none.
	if (session?.user) {
		let raw: unknown = (session.user as { entitlements?: unknown }).entitlements;
		if (raw === undefined) {
			try {
				const row = await db
					.selectFrom('user')
					.select('entitlements')
					.where('id', '=', session.user.id)
					.executeTakeFirst();
				raw = row?.entitlements;
			} catch {
				raw = undefined;
			}
		}
		event.locals.entitlements = parseEntitlements(raw);
	} else {
		event.locals.entitlements = [];
	}

	// Central API authentication (step 34). The hook is the single enforcement
	// point: any `/api/` route outside the explicit public allowlist requires a
	// session, so a new route cannot forget. `/api/auth/*` (owned by better-auth)
	// is public; page routes are guarded by `(app)/+layout.server.ts`. Default-deny.
	if (!building && requiresApiAuthChallenge(event.url.pathname, Boolean(session))) {
		return json(
			{ success: false, error: { message: 'Authentication required' } },
			{ status: 401 }
		);
	}

	// Central Stage 2 gate (05 §3): engine-only `/api/` prefixes return 403 here
	// when the caller lacks `autogen`, so a new sub-route cannot forget the check.
	// Handlers keep `requireAutogen` as defence in depth. Only authenticated
	// callers reach this — unauthenticated ones were already 401'd above.
	if (
		!building &&
		session?.user &&
		requiresAutogenEntitlement(event.url.pathname) &&
		!event.locals.entitlements.includes(ENTITLEMENT_AUTOGEN)
	) {
		return json(
			{ success: false, error: { message: 'Auto-generation requires an upgraded plan' } },
			{ status: 403 }
		);
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });

	return response;
};
