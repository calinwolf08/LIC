/**
 * Browser-side identity operations.
 *
 * Components call these instead of the better-auth client, so swapping the auth
 * provider only touches this file and `auth-client.ts`. Every operation resolves
 * to a result rather than throwing, matching how the forms render errors.
 */

import { authClient } from '$lib/auth-client';

export type IdentityResult = { ok: true } | { ok: false; message: string };

function toResult(
	response: { error: { message?: string } | null },
	fallback: string
): IdentityResult {
	return response.error ? { ok: false, message: response.error.message || fallback } : { ok: true };
}

export async function signInWithEmail(input: {
	email: string;
	password: string;
	rememberMe?: boolean;
}): Promise<IdentityResult> {
	return toResult(await authClient.signIn.email(input), 'Failed to sign in. Please try again.');
}

export async function signUpWithEmail(input: {
	name: string;
	email: string;
	password: string;
}): Promise<IdentityResult> {
	return toResult(
		await authClient.signUp.email(input),
		'Failed to create account. Please try again.'
	);
}

export async function signOut(): Promise<IdentityResult> {
	return toResult(await authClient.signOut(), 'Failed to sign out. Please try again.');
}
