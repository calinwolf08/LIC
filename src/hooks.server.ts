import { identity, pickActiveMembership } from '$lib/server/identity';
import { building } from '$app/environment';
import { json, type Handle } from '@sveltejs/kit';
import { billing } from '$lib/server/billing';
import { requiresApiAuthChallenge, requiresAutogenEntitlement } from '$lib/server/api-auth';
import { ENTITLEMENT_AUTOGEN } from '$lib/server/entitlements';

export const handle: Handle = async ({ event, resolve }) => {
	const session = await identity.getSession(event.request.headers);
	event.locals.session = session;

	// The organization this request acts under. The session's active org is only
	// a hint; membership is re-checked against the DB on every request.
	event.locals.organization = session
		? pickActiveMembership(
				await identity.listMemberships(session.user.id),
				session.activeOrganizationId
			)
		: null;

	// Entitlements come from the organization's subscription (its plan, while
	// the subscription is usable). No organization, no entitlements.
	event.locals.entitlements = event.locals.organization
		? await billing.entitlementsFor(event.locals.organization.organizationId)
		: [];

	// Central API authentication (step 34). The hook is the single enforcement
	// point: any `/api/` route outside the explicit public allowlist requires a
	// session, so a new route cannot forget. `/api/auth/*` (owned by better-auth)
	// is public; page routes are guarded by `(app)/+layout.server.ts`. Default-deny.
	if (!building && requiresApiAuthChallenge(event.url.pathname, Boolean(session))) {
		return json(
			{ success: false, error: { message: 'Authentication required' } },
			{ status: 401 }
		);
	}

	// Central Stage 2 gate (05 §3): engine-only `/api/` prefixes return 403 here
	// when the caller lacks `autogen`, so a new sub-route cannot forget the check.
	// Handlers keep `requireAutogen` as defence in depth. Only authenticated
	// callers reach this — unauthenticated ones were already 401'd above.
	if (
		!building &&
		session &&
		requiresAutogenEntitlement(event.url.pathname) &&
		!event.locals.entitlements.includes(ENTITLEMENT_AUTOGEN)
	) {
		return json(
			{ success: false, error: { message: 'Auto-generation requires an upgraded plan' } },
			{ status: 403 }
		);
	}

	return identity.handleRequest({ event, resolve, building });
};
