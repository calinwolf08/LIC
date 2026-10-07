/**
 * App-owned identity types.
 *
 * Everything outside `identity/better-auth/` (and the auth config itself) talks
 * to authentication through these types and the `IdentityService` interface —
 * never through better-auth's own `Session`/`User` or `auth.api`. That keeps the
 * auth library swappable: replacing better-auth means writing a new adapter that
 * satisfies this interface, not touching every route.
 *
 * Imports in this folder are RELATIVE (no `$lib`), because standalone scripts
 * run under plain `tsx` (the seed) import the identity singleton.
 */

/** The signed-in user, as the application sees them. */
export interface AppUser {
	readonly id: string;
	readonly email: string;
	readonly name: string;
}

/** A resolved, authenticated session. */
export interface AppSession {
	readonly user: AppUser;
}

export interface EmailSignUpInput {
	readonly name: string;
	readonly email: string;
	readonly password: string;
}

export interface EmailSignUpResult {
	readonly user: AppUser;
	/**
	 * Headers the provider wants on the HTTP response — chiefly `Set-Cookie` for
	 * the new session. A server action that signs a user up must copy these onto
	 * its response for the user to be logged in afterwards.
	 */
	readonly responseHeaders: Headers;
}

/** Why an identity operation was refused. Provider-neutral. */
export type IdentityErrorCode = 'email_taken' | 'invalid_input' | 'invalid_credentials';

/** A refusal the caller can show the user (as opposed to an infrastructure failure). */
export class IdentityError extends Error {
	constructor(
		readonly code: IdentityErrorCode,
		message: string
	) {
		super(message);
		this.name = 'IdentityError';
	}
}

/** The minimal slice of a SvelteKit request event the request handler needs. */
export interface IdentityRequestEvent {
	readonly request: Request;
	readonly url: URL;
}

export interface IdentityService {
	/** Resolve the session carried by a request's headers, or null when signed out. */
	getSession(headers: Headers): Promise<AppSession | null>;

	/**
	 * Create an account with email + password and start its session.
	 * @throws IdentityError when the provider refuses the sign-up (e.g. email taken).
	 */
	signUpWithEmail(input: EmailSignUpInput): Promise<EmailSignUpResult>;

	/**
	 * Serve the provider's own HTTP endpoints (sign-in, sign-out, session …)
	 * and pass every other request to `resolve`.
	 */
	handleRequest<E extends IdentityRequestEvent>(input: {
		event: E;
		resolve: (event: E) => Response | Promise<Response>;
		building: boolean;
	}): Promise<Response>;
}
