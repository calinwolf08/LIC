/**
 * `IdentityService` backed by better-auth.
 *
 * This folder (plus `src/lib/auth.ts` and `src/lib/auth-client.ts`) is the only
 * code allowed to import better-auth — enforced by `import-boundary.test.ts`.
 */

import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Kysely } from 'kysely';
import type { createAuth } from '../../../auth';
import type { DB } from '../../../db/types';
import { organizationSlug } from '../memberships';
import {
	IdentityError,
	isRole,
	type AppSession,
	type AppUser,
	type CreateOrganizationInput,
	type EmailSignUpInput,
	type EmailSignUpResult,
	type IdentityService,
	type OrgMembership
} from '../types';

type BetterAuth = ReturnType<typeof createAuth>;

function toAppUser(user: { id: string; email: string; name: string }): AppUser {
	return { id: user.id, email: user.email, name: user.name };
}

/**
 * better-auth signals refusals by throwing `APIError` (from better-call) with a
 * numeric `statusCode` and a `body.code` such as `USER_ALREADY_EXISTS`. Duck-typed
 * so this module does not depend on better-call directly.
 */
function toIdentityError(error: unknown): IdentityError | null {
	if (typeof error !== 'object' || error === null) return null;
	const { statusCode, body } = error as {
		statusCode?: unknown;
		body?: { code?: unknown; message?: unknown };
	};
	if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 500) return null;

	const code = typeof body?.code === 'string' ? body.code : '';
	const message = typeof body?.message === 'string' ? body.message : 'Request was refused';

	if (code.startsWith('USER_ALREADY_EXISTS')) return new IdentityError('email_taken', message);
	if (code === 'INVALID_EMAIL_OR_PASSWORD')
		return new IdentityError('invalid_credentials', message);
	return new IdentityError('invalid_input', message);
}

export function createBetterAuthIdentity({
	auth,
	db
}: {
	auth: BetterAuth;
	/** The same database `auth` was built over; used for membership reads. */
	db: Kysely<DB>;
}): IdentityService {
	return {
		async getSession(headers: Headers): Promise<AppSession | null> {
			const session = await auth.api.getSession({ headers });
			if (!session?.user) return null;
			return {
				user: toAppUser(session.user),
				activeOrganizationId: session.session.activeOrganizationId ?? null
			};
		},

		async signUpWithEmail(input: EmailSignUpInput): Promise<EmailSignUpResult> {
			try {
				const { headers, response } = await auth.api.signUpEmail({
					body: { name: input.name, email: input.email, password: input.password },
					returnHeaders: true
				});
				return { user: toAppUser(response.user), responseHeaders: headers };
			} catch (error) {
				throw toIdentityError(error) ?? error;
			}
		},

		async createOrganization(input: CreateOrganizationInput): Promise<{ id: string }> {
			const name = input.name.trim();
			if (!name) throw new IdentityError('invalid_input', 'Organization name is required');

			// With headers better-auth makes the SESSION's user the owner, so the
			// caller's ownerUserId must be that user — never silently someone else.
			if (input.headers) {
				const session = await auth.api.getSession({ headers: input.headers });
				if (session?.user.id !== input.ownerUserId) {
					throw new Error('createOrganization: ownerUserId does not match the request session');
				}
			}

			try {
				// Without headers better-auth trusts `userId` (a server-only call);
				// with them it uses the session's user and makes the org active.
				const created = await auth.api.createOrganization({
					body: {
						name,
						slug: organizationSlug(name),
						...(input.headers ? {} : { userId: input.ownerUserId })
					},
					...(input.headers ? { headers: input.headers } : {})
				});
				if (!created) throw new Error('Organization was not created');
				return { id: created.id };
			} catch (error) {
				throw toIdentityError(error) ?? error;
			}
		},

		async listMemberships(userId: string): Promise<OrgMembership[]> {
			const rows = await db
				.selectFrom('member')
				.innerJoin('organization', 'organization.id', 'member.organizationId')
				.select(['member.organizationId', 'member.role', 'organization.name'])
				.where('member.userId', '=', userId)
				.orderBy('member.createdAt', 'asc')
				.orderBy('member.id', 'asc')
				.execute();

			// A role this app does not know (e.g. written by another tool) grants nothing.
			return rows.flatMap((row) =>
				isRole(row.role)
					? [{ organizationId: row.organizationId, organizationName: row.name, role: row.role }]
					: []
			);
		},

		handleRequest({ event, resolve, building }) {
			// svelteKitHandler is typed against SvelteKit's full RequestEvent; it only
			// reads `request` and `url`, which IdentityRequestEvent guarantees.
			return svelteKitHandler({
				auth,
				event: event as never,
				resolve: resolve as never,
				building
			});
		}
	};
}
