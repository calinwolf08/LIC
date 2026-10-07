/**
 * What a subscription grants. Pure functions: no I/O, `now` passed in.
 */

import { isPlanId, PLANS, type Entitlement } from '../../billing/plans';
import { graceEndsAt } from '../../billing/policy';
import type { SubscriptionRecord, SubscriptionStatus } from './types';

/**
 * Whether a subscription currently grants its plan: `active` and `trialing`
 * do; `past_due` does until its grace period ends; `incomplete` (checkout not
 * finished) and `canceled` do not.
 */
export function isSubscriptionUsable(
	subscription: Pick<SubscriptionRecord, 'status' | 'graceEndsAt'> | null,
	now: Date
): boolean {
	if (!subscription) return false;
	switch (subscription.status) {
		case 'active':
		case 'trialing':
			return true;
		case 'past_due':
			return (
				subscription.graceEndsAt !== null && now.getTime() < Date.parse(subscription.graceEndsAt)
			);
		default:
			return false;
	}
}

/** The entitlements a subscription grants right now. A retired plan id grants nothing. */
export function entitlementsForSubscription(
	subscription: Pick<SubscriptionRecord, 'status' | 'graceEndsAt' | 'planId'> | null,
	now: Date
): Entitlement[] {
	if (!subscription || !isSubscriptionUsable(subscription, now)) return [];
	return isPlanId(subscription.planId) ? [...PLANS[subscription.planId].entitlements] : [];
}

/**
 * The grace deadline after a status change: started when a subscription first
 * becomes `past_due`, kept while it stays `past_due` (a repeated failure does
 * not extend it), cleared once it leaves `past_due`.
 */
export function nextGraceEndsAt(
	previous: { status: SubscriptionStatus; graceEndsAt: string | null } | null,
	nextStatus: SubscriptionStatus,
	now: Date
): string | null {
	if (nextStatus !== 'past_due') return null;
	if (previous?.status === 'past_due' && previous.graceEndsAt) return previous.graceEndsAt;
	return graceEndsAt(now).toISOString();
}
