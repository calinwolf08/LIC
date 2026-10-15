/**
 * The (app) layout guard's order: signed-out → login, no organization →
 * onboarding, otherwise the existing schedule-first checks.
 */

import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

// A user with an active schedule, so the schedule-first check passes.
vi.mock('$lib/db', () => {
	const query = {
		select: () => query,
		where: () => query,
		limit: () => query,
		executeTakeFirst: async () => ({ active_schedule_id: 'sched-1' })
	};
	return { db: { selectFrom: () => query } };
});

import { load } from './+layout.server';

const session = {
	user: { id: 'u1', email: 'u1@example.com', name: 'U One' },
	activeOrganizationId: null
};
const membership = { organizationId: 'org-1', organizationName: 'Program', role: 'owner' as const };

function run(locals: Partial<App.Locals>, path = '/dashboard') {
	return load({
		locals: { session: null, organization: null, entitlements: [], ...locals },
		url: new URL(`http://localhost${path}`)
	} as never);
}

async function redirectOf(fn: () => unknown) {
	try {
		await fn();
	} catch (error) {
		if (isRedirect(error)) return error.location;
		throw error;
	}
	return null;
}

describe('(app) layout guard', () => {
	it('sends a signed-out visitor to login', async () => {
		expect(await redirectOf(() => run({}))).toBe('/login?redirectTo=%2Fdashboard');
	});

	it('sends a signed-in user without an organization to onboarding', async () => {
		expect(await redirectOf(() => run({ session }))).toBe('/onboarding/organization');
	});

	it('lets a member of an organization through', async () => {
		expect(await redirectOf(() => run({ session, organization: membership }))).toBeNull();
	});
});
