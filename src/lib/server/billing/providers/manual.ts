/**
 * The "no payment processor" provider.
 *
 * Until payments are live, choosing a plan is all it takes: every subscription
 * is active immediately, free, with no billing period and no customer record at
 * a processor. Swapping in a real provider changes nothing above this layer.
 */

import type { PaymentProvider, ProviderSubscription } from '../types';

export const MANUAL_PROVIDER_ID = 'manual';

export function createManualProvider(): PaymentProvider {
	const active = (
		planId: ProviderSubscription['planId'],
		interval: ProviderSubscription['interval']
	): ProviderSubscription => ({
		providerSubscriptionId: null,
		planId,
		interval,
		status: 'active',
		currentPeriodEnd: null,
		cancelAtPeriodEnd: false
	});

	return {
		id: MANUAL_PROVIDER_ID,

		async ensureCustomer() {
			return { providerCustomerId: null };
		},

		async startSubscription({ planId, interval }) {
			return { kind: 'activated', subscription: active(planId, interval) };
		},

		async changeSubscription({ planId, interval }) {
			return { kind: 'updated', subscription: active(planId, interval) };
		},

		async cancelSubscription() {
			// No billing period to run out: a manual cancellation is immediate.
			return { status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: false };
		},

		async getCustomerPortalUrl() {
			return null;
		},

		async parseWebhook() {
			throw new Error('The manual payment provider does not receive webhooks');
		}
	};
}
