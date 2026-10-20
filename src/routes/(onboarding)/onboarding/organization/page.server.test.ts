/**
 * /onboarding/organization — where a signed-in user without an organization
 * names one (and becomes its owner).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const createOrganization = vi.fn();
vi.mock('$lib/server/identity', async () => ({
	IdentityError: (await import('$lib/server/identity/types')).IdentityError,
	identity: { createOrganization: (input: unknown) => createOrganization(input) }
}));

const subscribe = vi.fn();
vi.mock('$lib/server/billing', () => ({
	billing: { subscribe: (input: unknown) => subscribe(input) }
}));

import { IdentityError } from '$lib/server/identity/types';
import { actions, load } from './+page.server';

const session = {
	user: { id: 'u1', email: 'u1@example.com', name: 'U One' },
	activeOrganizationId: null
};
const membership = { organizationId: 'org-1', organizationName: 'Program', role: 'owner' as const };

function locals(overrides: Partial<App.Locals> = {}): App.Locals {
	return { session, organization: null, entitlements: [], ...overrides };
}

function post(name: string | null, plan?: string) {
	const body = new FormData();
	if (name !== null) body.set('name', name);
	if (plan) body.set('plan', plan);
	return new Request('http://localhost/onboarding/organization', {
		method: 'POST',
		body,
		headers: { cookie: 'session=abc' }
	});
}

/** Run `fn`, returning the redirect it throws (failing if it does not). */
async function redirectOf(fn: () => unknown) {
	try {
		await fn();
	} catch (error) {
		if (isRedirect(error)) return { status: error.status, location: error.location };
		throw error;
	}
	throw new Error('expected a redirect');
}

const pageUrl = (search = '') => new URL(`http://localhost/onboarding/organization${search}`);

afterEach(() => {
	vi.unstubAllEnvs();
});

const submit = (request: Request, l: App.Locals) =>
	actions.default({ request, locals: l } as never);

describe('onboarding/organization load', () => {
	it('sends a signed-out visitor to login, returning here afterwards', async () => {
		expect(
			await redirectOf(() => load({ locals: locals({ session: null }), url: pageUrl() } as never))
		).toEqual({
			status: 302,
			location: '/login?redirectTo=%2Fonboarding%2Forganization'
		});
	});

	it('sends a user who already has an organization into the app', async () => {
		expect(
			await redirectOf(() =>
				load({ locals: locals({ organization: membership }), url: pageUrl() } as never)
			)
		).toEqual({ status: 302, location: '/' });
	});

	it('renders for a signed-in user without an organization', async () => {
		expect(await load({ locals: locals(), url: pageUrl() } as never)).toEqual({
			email: 'u1@example.com',
			plan: 'standard'
		});
	});

	it('pre-selects the plan chosen at sign-up only while tier testing is on', async () => {
		const url = pageUrl('?plan=pro');
		expect(await load({ locals: locals(), url } as never)).toMatchObject({ plan: 'standard' });
		vi.stubEnv('ENABLE_TIER_TESTING', 'true');
		expect(await load({ locals: locals(), url } as never)).toMatchObject({ plan: 'pro' });
	});
});

describe('onboarding/organization action', () => {
	beforeEach(() => {
		createOrganization.mockReset();
		subscribe.mockReset();
		subscribe.mockResolvedValue({ kind: 'active', subscription: {} });
	});

	it('creates the organization as the session’s user and continues into the app', async () => {
		createOrganization.mockResolvedValue({ id: 'org-new' });
		const request = post('  New Program  ');

		// Next onboarding step: set up the schedule the account started with.
		expect(await redirectOf(() => submit(request, locals()))).toEqual({
			status: 303,
			location: '/schedules/setup?onboarding'
		});
		expect(createOrganization).toHaveBeenCalledWith({
			name: 'New Program',
			ownerUserId: 'u1',
			headers: request.headers
		});
		// New organizations start on the default plan (Standard, annual).
		expect(subscribe).toHaveBeenCalledWith({
			organizationId: 'org-new',
			organizationName: 'New Program',
			billingEmail: 'u1@example.com',
			planId: 'standard',
			interval: 'year'
		});
	});

	it('starts the chosen plan only while tier testing is on', async () => {
		createOrganization.mockResolvedValue({ id: 'org-new' });
		await redirectOf(() => submit(post('Program', 'pro'), locals()));
		expect(subscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planId: 'standard' }));

		vi.stubEnv('ENABLE_TIER_TESTING', 'true');
		await redirectOf(() => submit(post('Program', 'pro'), locals()));
		expect(subscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planId: 'pro' }));

		// An unknown plan falls back to the default, flag or not.
		await redirectOf(() => submit(post('Program', 'gold'), locals()));
		expect(subscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planId: 'standard' }));
	});

	it('sends the user to a hosted checkout when the provider asks for one', async () => {
		createOrganization.mockResolvedValue({ id: 'org-new' });
		subscribe.mockResolvedValue({ kind: 'redirect', url: 'https://pay.example/checkout' });
		expect(await redirectOf(() => submit(post('Program'), locals()))).toEqual({
			status: 303,
			location: 'https://pay.example/checkout'
		});
	});

	it.each([
		['missing', null],
		['too short', 'A'],
		['blank', '   ']
	])('rejects a %s name without creating anything', async (_label, name) => {
		const result = (await submit(post(name), locals())) as {
			status: number;
			data: { errors: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data.errors.length).toBeGreaterThan(0);
		expect(createOrganization).not.toHaveBeenCalled();
	});

	it('shows a provider refusal as a form error', async () => {
		createOrganization.mockRejectedValue(new IdentityError('invalid_input', 'Not allowed'));
		const result = (await submit(post('Program'), locals())) as {
			status: number;
			data: { name: string; errors: string[] };
		};
		expect(result.status).toBe(400);
		expect(result.data).toEqual({ name: 'Program', errors: ['Not allowed'] });
		expect(subscribe).not.toHaveBeenCalled();
	});

	it('does not create a second organization on a double submit', async () => {
		expect(
			await redirectOf(() => submit(post('Program'), locals({ organization: membership })))
		).toEqual({ status: 303, location: '/' });
		expect(createOrganization).not.toHaveBeenCalled();
	});

	it('sends a signed-out submit to login', async () => {
		expect(await redirectOf(() => submit(post('Program'), locals({ session: null })))).toEqual({
			status: 303,
			location: '/login?redirectTo=%2Fonboarding%2Forganization'
		});
		expect(createOrganization).not.toHaveBeenCalled();
	});
});
