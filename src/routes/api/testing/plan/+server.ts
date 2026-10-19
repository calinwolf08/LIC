/**
 * TEMPORARY tier testing: switch the active organization between plans.
 *
 * POST /api/testing/plan  { planId: 'standard' | 'pro' }
 *
 * Exists only while ENABLE_TIER_TESTING=true (404 otherwise), and only for
 * members who may manage billing. Goes through BillingService like any plan
 * change, so entitlements follow on the next request.
 */

import type { RequestHandler } from './$types';
import { z, ZodError } from 'zod';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { DEFAULT_BILLING_INTERVAL, PLAN_IDS } from '$lib/billing/plans';
import { can } from '$lib/server/authz';
import { billing } from '$lib/server/billing';
import { isTierTestingEnabled } from '$lib/server/billing/tier-testing';

const bodySchema = z.object({ planId: z.enum(PLAN_IDS) });

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!isTierTestingEnabled()) return errorResponse('Not found', 404);

	const organization = locals.organization;
	if (!organization) return errorResponse('No organization', 400);
	if (!can(organization, 'billing:manage')) {
		return errorResponse('You do not have permission to change the plan', 403);
	}

	try {
		const { planId } = bodySchema.parse(await request.json());
		const current = await billing.getSubscription(organization.organizationId);

		if (!current) {
			await billing.subscribe({
				organizationId: organization.organizationId,
				organizationName: organization.organizationName,
				billingEmail: locals.session?.user.email ?? '',
				planId,
				interval: DEFAULT_BILLING_INTERVAL
			});
		} else if (current.planId !== planId) {
			await billing.changePlan({
				organizationId: organization.organizationId,
				planId,
				interval: current.interval
			});
		}
		return successResponse({ planId });
	} catch (error) {
		if (error instanceof ZodError) return validationErrorResponse(error);
		return handleApiError(error);
	}
};
