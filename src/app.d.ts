// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session, User } from 'better-auth';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: { session: Session; user: User } | null;
			/** Parsed entitlement strings for the current user (e.g. ["autogen"]). */
			entitlements: string[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
