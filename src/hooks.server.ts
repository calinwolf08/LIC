import { auth } from '$lib/auth'; // path to your auth file
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { parseEntitlements } from '$lib/server/entitlements';
import { db } from '$lib/db';

export const handle: Handle = async ({ event, resolve }) => {
	// Skip auth check for non-auth API routes during E2E testing
	// But allow /api/auth/* routes to work normally for authentication tests
	if (
		process.env.E2E_TESTING === 'true' &&
		event.url.pathname.startsWith('/api/') &&
		!event.url.pathname.startsWith('/api/auth')
	) {
		console.log('[hooks.server] Bypassing auth for E2E test API request');
		event.locals.session = null;
		event.locals.entitlements = parseEntitlements(process.env.E2E_ENTITLEMENTS);
		return resolve(event);
	}

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

	const response = await svelteKitHandler({ event, resolve, auth, building });

	return response;
};
