// See https://svelte.dev/docs/kit/types#app.d.ts

import type { AppSession, OrgMembership } from '$lib/server/identity/types';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: AppSession | null;
			/**
			 * The organization this request acts under, with the user's role in it.
			 * Null when signed out or when the user belongs to no organization yet.
			 */
			organization: OrgMembership | null;
			/** What the organization's plan grants right now (e.g. ["autogen"]). */
			entitlements: string[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
