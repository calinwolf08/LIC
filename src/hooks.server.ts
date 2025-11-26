import { auth } from "$lib/auth"; // path to your auth file
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
    console.log('[hooks.server] Request received:', event.request.method, event.url.pathname);

    // Skip auth for API routes during E2E testing
    if (process.env.E2E_TESTING === 'true' && event.url.pathname.startsWith('/api/')) {
        console.log('[hooks.server] Bypassing auth for E2E test API request');
        event.locals.session = null;
        return resolve(event);
    }

    console.log('[hooks.server] Calling auth.api.getSession');
    const session = await auth.api.getSession({ headers: event.request.headers });
    console.log('[hooks.server] Session obtained');
    event.locals.session = session;

    console.log('[hooks.server] Calling svelteKitHandler');
    const response = await svelteKitHandler({ event, resolve, auth, building });
    console.log('[hooks.server] svelteKitHandler returned');

    return response;
}
