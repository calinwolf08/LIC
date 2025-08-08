import { PUBLIC_BASE_URL } from "$env/static/public"
import { createAuthClient } from "better-auth/svelte"
export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: PUBLIC_BASE_URL
})
