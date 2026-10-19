/**
 * POST /api/testing/plan — the temporary tier switch (ENABLE_TIER_TESTING).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSubscription = vi.fn();
const subscribe = vi.fn();
const changePlan = vi.fn();
vi.mock('$lib/server/billing', () => ({
	billing: {
		getSubscription: (id: string) => getSubscription(id),
		subscribe: (input: unknown) => subscribe(input),
		changePlan: (input: unknown) => changePlan(input)
	}
}));

import { POST } from './+server';

const session = {
	user: { id: 'u1', email: 'u1@example.com', name: 'U One' },
	activeOrganizationId: null
};
const owner = { organizationId: 'org-1', organizationName: 'Program', role: 'owner' as const };

function call(body: unknown, organization: App.Locals['organization'] = owner) {
	return POST({
		request: new Request('http://localhost/api/testing/plan', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { session, organization, entitlements: [] }
	} as never);
}

describe('POST /api/testing/plan', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('ENABLE_TIER_TESTING', 'true');
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('does not exist unless tier testing is on', async () => {
		vi.stubEnv('ENABLE_TIER_TESTING', '');
		const res = await call({ planId: 'pro' });
		expect(res.status).toBe(404);
		expect(changePlan).not.toHaveBeenCalled();
	});

	it('switches the active organization to the requested plan', async () => {
		getSubscription.mockResolvedValue({ planId: 'standard', interval: 'year' });
		const res = await call({ planId: 'pro' });
		expect(res.status).toBe(200);
		expect(changePlan).toHaveBeenCalledWith({
			organizationId: 'org-1',
			planId: 'pro',
			interval: 'year'
		});
	});

	it('is a no-op when already on that plan', async () => {
		getSubscription.mockResolvedValue({ planId: 'pro', interval: 'year' });
		expect((await call({ planId: 'pro' })).status).toBe(200);
		expect(changePlan).not.toHaveBeenCalled();
	});

	it('starts a subscription for an organization without one', async () => {
		getSubscription.mockResolvedValue(null);
		expect((await call({ planId: 'standard' })).status).toBe(200);
		expect(subscribe).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: 'org-1', planId: 'standard' })
		);
	});

	it('refuses members who may not manage billing, and users without an organization', async () => {
		expect((await call({ planId: 'pro' }, { ...owner, role: 'student' })).status).toBe(403);
		expect((await call({ planId: 'pro' }, null)).status).toBe(400);
		expect(changePlan).not.toHaveBeenCalled();
	});

	it('rejects an unknown plan', async () => {
		expect((await call({ planId: 'gold' })).status).toBe(400);
	});
});
