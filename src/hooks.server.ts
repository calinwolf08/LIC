import { auth } from '$lib/auth'; // path to your auth file
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // Skip auth check for non-auth API routes during E2E testing
    // But allow /api/auth/* routes to work normally for authentication tests
    if (process.env.E2E_TESTING === 'true' && event.url.pathname.startsWith('/api/') && !event.url.pathname.startsWith('/api/auth')) {
        console.log('[hooks.server] Bypassing auth for E2E test API request');
        event.locals.session = null;
        return resolve(event);
    }

    const session = await auth.api.getSession({ headers: event.request.headers });
    event.locals.session = session;

    const response = await svelteKitHandler({ event, resolve, auth, building });

    return response;
};
