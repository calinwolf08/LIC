/**
 * `IdentityService` backed by better-auth.
 *
 * This folder (plus `src/lib/auth.ts` and `src/lib/auth-client.ts`) is the only
 * code allowed to import better-auth — enforced by `import-boundary.test.ts`.
 */

import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { createAuth } from '../../../auth';
import {
	IdentityError,
	type AppSession,
	type AppUser,
	type EmailSignUpInput,
	type EmailSignUpResult,
	type IdentityService
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

export function createBetterAuthIdentity(auth: BetterAuth): IdentityService {
	return {
		async getSession(headers: Headers): Promise<AppSession | null> {
			const session = await auth.api.getSession({ headers });
			if (!session?.user) return null;
			return { user: toAppUser(session.user) };
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
