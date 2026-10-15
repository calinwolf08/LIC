import { env } from '$env/dynamic/public';
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
	/**
	 * The server's base URL, read at runtime (not baked in at build time) so one
	 * built image serves any deployment. Unset → the page's own origin, which is
	 * right whenever the app and its auth routes share a domain.
	 */
	baseURL: env.PUBLIC_BASE_URL || undefined
});
