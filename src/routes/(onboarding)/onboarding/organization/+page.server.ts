import { fail, redirect } from '@sveltejs/kit';
import { createOrganizationSchema } from '$lib/features/organizations/schemas';
import {
	DEFAULT_BILLING_INTERVAL,
	DEFAULT_PLAN_ID,
	isPlanId,
	type PlanId
} from '$lib/billing/plans';
import { billing } from '$lib/server/billing';
import { isTierTestingEnabled } from '$lib/server/billing/tier-testing';
import { identity, IdentityError } from '$lib/server/identity';
import type { Actions, PageServerLoad } from './$types';

/**
 * Name your organization: where a signed-in user without one lands (the app
 * layout redirects here). Creating it makes the user its `owner` and starts
 * the default plan (Standard) — choosing a tier here arrives with the reworked
 * sign-up (plan Phase 4).
 */

const SELF = '/onboarding/organization';

/**
 * The plan a new organization starts on: the default, unless tier testing is
 * on (ENABLE_TIER_TESTING) and a valid plan was chosen.
 */
function startingPlan(requested: unknown): PlanId {
	return isTierTestingEnabled() && isPlanId(requested) ? requested : DEFAULT_PLAN_ID;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session) throw redirect(302, `/login?redirectTo=${encodeURIComponent(SELF)}`);
	if (locals.organization) throw redirect(302, '/');
	return {
		email: locals.session.user.email,
		// Pre-selected from sign-up (?plan=…) when tier testing is on.
		plan: startingPlan(url.searchParams.get('plan'))
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.session) throw redirect(303, `/login?redirectTo=${encodeURIComponent(SELF)}`);
		// A double submit must not create a second organization.
		if (locals.organization) throw redirect(303, '/');

		const form = await request.formData();
		const raw = String(form.get('name') ?? '');
		const parsed = createOrganizationSchema.safeParse({ name: raw });
		if (!parsed.success) {
			return fail(400, { name: raw, errors: parsed.error.flatten().fieldErrors.name ?? [] });
		}

		let organizationId: string;
		try {
			({ id: organizationId } = await identity.createOrganization({
				name: parsed.data.name,
				ownerUserId: locals.session.user.id,
				headers: request.headers
			}));
		} catch (error) {
			if (error instanceof IdentityError) {
				return fail(400, { name: raw, errors: [error.message] });
			}
			throw error;
		}

		// The manual provider activates immediately; a hosted checkout would
		// return a URL to send the user to instead.
		const subscribed = await billing.subscribe({
			organizationId,
			organizationName: parsed.data.name,
			billingEmail: locals.session.user.email,
			planId: startingPlan(form.get('plan')),
			interval: DEFAULT_BILLING_INTERVAL
		});
		// Next onboarding step: name the schedule the account started with and set
		// its dates (a hosted checkout, when a processor needs one, comes first).
		throw redirect(
			303,
			subscribed.kind === 'redirect' ? subscribed.url : '/schedules/setup?onboarding'
		);
	}
};
