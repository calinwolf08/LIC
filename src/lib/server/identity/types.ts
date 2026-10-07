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
	/**
	 * The organization the session last selected, if any. A hint, not a grant:
	 * callers must confirm the user is still a member (see `pickActiveMembership`).
	 */
	readonly activeOrganizationId: string | null;
}

/**
 * Roles a user can hold within an organization.
 *
 * - `owner`     — created the organization; full access including billing.
 * - `admin`     — additional organization administrators (roadmap).
 * - `preceptor` — limited access to their own schedule (roadmap).
 * - `student`   — limited access to their own schedule (roadmap).
 *
 * What each role may do lives in `$lib/server/authz`, not here.
 */
export const ROLES = ['owner', 'admin', 'preceptor', 'student'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
	return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** One user's membership in one organization. */
export interface OrgMembership {
	readonly organizationId: string;
	readonly organizationName: string;
	readonly role: Role;
}

export interface CreateOrganizationInput {
	readonly name: string;
	readonly ownerUserId: string;
	/**
	 * The creating request's headers, when there is one. With them, the new
	 * organization also becomes the session's active organization, and the
	 * session's user must be `ownerUserId`.
	 */
	readonly headers?: Headers;
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

	/** Create an organization with `ownerUserId` as its `owner` member. */
	createOrganization(input: CreateOrganizationInput): Promise<{ id: string }>;

	/** Every organization `userId` belongs to, oldest membership first. */
	listMemberships(userId: string): Promise<OrgMembership[]>;

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
