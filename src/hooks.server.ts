import { auth } from '$lib/auth'; // path to your auth file
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { json, type Handle } from '@sveltejs/kit';
import { parseEntitlements } from '$lib/server/entitlements';
import { requiresApiAuthChallenge } from '$lib/server/api-auth';
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

	const response = await svelteKitHandler({ event, resolve, auth, building });

	return response;
};
