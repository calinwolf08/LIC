import { describe, expect, it } from 'vitest';
import type { SubscriptionRecord } from '../types';
import { getPaymentProvider, MANUAL_PROVIDER_ID } from './index';
import { createManualProvider } from './manual';

const record: SubscriptionRecord = {
	id: 'sub-1',
	organizationId: 'org-1',
	planId: 'standard',
	interval: 'year',
	status: 'active',
	provider: 'manual',
	providerSubscriptionId: null,
	currentPeriodEnd: null,
	graceEndsAt: null,
	cancelAtPeriodEnd: false
};

describe('getPaymentProvider', () => {
	it('defaults to the manual provider', () => {
		expect(getPaymentProvider({}).id).toBe(MANUAL_PROVIDER_ID);
		expect(getPaymentProvider({ PAYMENT_PROVIDER: '  ' }).id).toBe(MANUAL_PROVIDER_ID);
		expect(getPaymentProvider({ PAYMENT_PROVIDER: 'manual' }).id).toBe(MANUAL_PROVIDER_ID);
	});

	it('refuses an unknown provider instead of billing nobody', () => {
		expect(() => getPaymentProvider({ PAYMENT_PROVIDER: 'stripe' })).toThrow(
			/Unknown PAYMENT_PROVIDER 'stripe'/
		);
	});
});

describe('manual provider', () => {
	const provider = createManualProvider();

	it('has no processor-side customer', async () => {
		expect(
			await provider.ensureCustomer({
				organizationId: 'org-1',
				organizationName: 'Program',
				billingEmail: 'a@example.com',
				existingCustomerId: null
			})
		).toEqual({ providerCustomerId: null });
	});

	it('activates any plan immediately, with no billing period', async () => {
		expect(
			await provider.startSubscription({
				organizationId: 'org-1',
				providerCustomerId: null,
				planId: 'pro',
				interval: 'month'
			})
		).toEqual({
			kind: 'activated',
			subscription: {
				providerSubscriptionId: null,
				planId: 'pro',
				interval: 'month',
				status: 'active',
				currentPeriodEnd: null,
				cancelAtPeriodEnd: false
			}
		});
	});

	it('changes plans immediately', async () => {
		const changed = await provider.changeSubscription({
			subscription: record,
			planId: 'pro',
			interval: 'year'
		});
		expect(changed).toMatchObject({
			kind: 'updated',
			subscription: { planId: 'pro', interval: 'year', status: 'active' }
		});
	});

	it('cancels immediately, even when asked for period end', async () => {
		expect(await provider.cancelSubscription({ subscription: record, atPeriodEnd: true })).toEqual({
			status: 'canceled',
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false
		});
	});

	it('has no customer portal and receives no webhooks', async () => {
		expect(
			await provider.getCustomerPortalUrl({ providerCustomerId: 'x', returnUrl: '/' })
		).toBeNull();
		await expect(provider.parseWebhook(new Request('http://localhost/'))).rejects.toThrow();
	});
});
