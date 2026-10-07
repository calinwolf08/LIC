// See https://svelte.dev/docs/kit/types#app.d.ts

import type { AppSession } from '$lib/server/identity/types';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: AppSession | null;
			/** Parsed entitlement strings for the current user (e.g. ["autogen"]). */
			entitlements: string[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
