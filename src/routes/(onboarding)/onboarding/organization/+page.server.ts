import { fail, redirect } from '@sveltejs/kit';
import { createOrganizationSchema } from '$lib/features/organizations/schemas';
import { DEFAULT_BILLING_INTERVAL, DEFAULT_PLAN_ID } from '$lib/billing/plans';
import { billing } from '$lib/server/billing';
import { identity, IdentityError } from '$lib/server/identity';
import type { Actions, PageServerLoad } from './$types';

/**
 * Name your organization: where a signed-in user without one lands (the app
 * layout redirects here). Creating it makes the user its `owner` and starts
 * the default plan (Standard) — choosing a tier here arrives with the reworked
 * sign-up (plan Phase 4).
 */

const SELF = '/onboarding/organization';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) throw redirect(302, `/login?redirectTo=${encodeURIComponent(SELF)}`);
	if (locals.organization) throw redirect(302, '/');
	return { email: locals.session.user.email };
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
			planId: DEFAULT_PLAN_ID,
			interval: DEFAULT_BILLING_INTERVAL
		});
		throw redirect(303, subscribed.kind === 'redirect' ? subscribed.url : '/');
	}
};
