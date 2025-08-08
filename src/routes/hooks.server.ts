import { auth } from "$lib/auth"; // path to your auth file
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
    const session = await auth.api.getSession({ headers: event.request.headers });
    event.locals.session = session;

    return svelteKitHandler({ event, resolve, auth, building });
}
