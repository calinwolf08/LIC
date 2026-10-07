/**
 * BillingService against a fully migrated database: the manual provider's
 * immediate activation, plan changes, cancellation history, and — with a fake
 * hosted-checkout provider — webhooks, idempotency and the 30-day grace period.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../../db/types';
import { cleanupTestDatabase, createTestDatabaseWithMigrations } from '../../db/test-utils';
import { createManualProvider } from './providers/manual';
import { createBillingService, type BillingService } from './service';
import { BillingError, type PaymentProvider, type ProviderSubscription } from './types';

const ORG = { organizationId: 'org-1', organizationName: 'Program', billingEmail: 'o@example.com' };

/** A provider that, like a real processor, sends users to a hosted checkout. */
function hostedProvider(id = 'hosted'): PaymentProvider {
	return {
		id,
		async ensureCustomer() {
			return { providerCustomerId: 'cus_1' };
		},
		async startSubscription() {
			return { kind: 'redirect', url: 'https://pay.example/checkout' };
		},
		async changeSubscription() {
			return { kind: 'redirect', url: 'https://pay.example/change' };
		},
		async cancelSubscription() {
			return {
				status: 'active',
				currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
				cancelAtPeriodEnd: true
			};
		},
		async getCustomerPortalUrl() {
			return 'https://pay.example/portal';
		},
		async parseWebhook() {
			return null;
		}
	};
}

function providerState(
	overrides: Partial<ProviderSubscription> = {}
): ProviderSubscription & { providerSubscriptionId: string } {
	return {
		providerSubscriptionId: 'sub_ext_1',
		planId: 'pro',
		interval: 'year',
		status: 'active',
		currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
		cancelAtPeriodEnd: false,
		...overrides
	} as ProviderSubscription & { providerSubscriptionId: string };
}

async function billingError(promise: Promise<unknown>) {
	const error = await promise.catch((e: unknown) => e);
	expect(error).toBeInstanceOf(BillingError);
	return (error as BillingError).code;
}

describe('BillingService', () => {
	let db: Kysely<DB>;
	let clock: Date;
	const now = () => clock;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		clock = new Date('2026-06-01T00:00:00Z');
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	describe('with the manual provider', () => {
		let billing: BillingService;
		beforeEach(() => {
			billing = createBillingService({ db, provider: createManualProvider(), now });
		});

		it('activates a subscription immediately and grants its plan', async () => {
			const result = await billing.subscribe({ ...ORG, planId: 'pro', interval: 'year' });

			expect(result).toMatchObject({
				kind: 'active',
				subscription: {
					organizationId: 'org-1',
					planId: 'pro',
					interval: 'year',
					status: 'active',
					provider: 'manual',
					providerSubscriptionId: null,
					graceEndsAt: null
				}
			});
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);

			const customer = await db.selectFrom('billing_customers').selectAll().executeTakeFirst();
			expect(customer).toMatchObject({
				organization_id: 'org-1',
				provider: 'manual',
				provider_customer_id: null
			});
		});

		it('grants nothing to an organization without a subscription', async () => {
			expect(await billing.getSubscription('org-none')).toBeNull();
			expect(await billing.entitlementsFor('org-none')).toEqual([]);
		});

		it('refuses a second live subscription', async () => {
			await billing.subscribe({ ...ORG, planId: 'standard', interval: 'year' });
			expect(
				await billingError(billing.subscribe({ ...ORG, planId: 'pro', interval: 'year' }))
			).toBe('already_subscribed');
		});

		it('upgrades and downgrades, moving entitlements with the plan', async () => {
			await billing.subscribe({ ...ORG, planId: 'standard', interval: 'year' });
			expect(await billing.entitlementsFor('org-1')).toEqual([]);

			const up = await billing.changePlan({
				organizationId: 'org-1',
				planId: 'pro',
				interval: 'month'
			});
			expect(up).toMatchObject({
				kind: 'active',
				subscription: { planId: 'pro', interval: 'month' }
			});
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);

			await billing.changePlan({ organizationId: 'org-1', planId: 'standard', interval: 'month' });
			expect(await billing.entitlementsFor('org-1')).toEqual([]);
		});

		it('refuses a plan change that changes nothing, or with no subscription', async () => {
			expect(
				await billingError(
					billing.changePlan({ organizationId: 'org-1', planId: 'pro', interval: 'year' })
				)
			).toBe('no_subscription');

			await billing.subscribe({ ...ORG, planId: 'pro', interval: 'year' });
			expect(
				await billingError(
					billing.changePlan({ organizationId: 'org-1', planId: 'pro', interval: 'year' })
				)
			).toBe('no_change');
		});

		it('cancels, keeps the row as history, and allows a fresh subscription', async () => {
			await billing.subscribe({ ...ORG, planId: 'pro', interval: 'year' });
			const canceled = await billing.cancel('org-1', { atPeriodEnd: false });
			expect(canceled.status).toBe('canceled');
			expect(await billing.getSubscription('org-1')).toBeNull();
			expect(await billing.entitlementsFor('org-1')).toEqual([]);

			await billing.subscribe({ ...ORG, planId: 'standard', interval: 'year' });
			const rows = await db
				.selectFrom('subscriptions')
				.select(['plan_id', 'status'])
				.orderBy('created_at')
				.execute();
			expect(rows).toHaveLength(2);
			expect(rows.map((r) => r.status).sort()).toEqual(['active', 'canceled']);
		});

		it('refuses to manage a subscription another provider owns', async () => {
			const hosted = createBillingService({ db, provider: hostedProvider(), now });
			await billing.subscribe({ ...ORG, planId: 'standard', interval: 'year' });
			expect(
				await billingError(
					hosted.changePlan({ organizationId: 'org-1', planId: 'pro', interval: 'year' })
				)
			).toBe('provider_mismatch');
			expect(await billingError(hosted.cancel('org-1', { atPeriodEnd: true }))).toBe(
				'provider_mismatch'
			);
		});
	});

	describe('with a hosted-checkout provider', () => {
		let billing: BillingService;
		beforeEach(() => {
			billing = createBillingService({ db, provider: hostedProvider(), now });
		});

		/** Subscribe, then let the processor confirm checkout by webhook. */
		async function subscribeAndConfirm(state = providerState()) {
			await billing.subscribe({ ...ORG, planId: state.planId, interval: state.interval });
			expect(
				await billing.handleWebhook({
					type: 'subscription.updated',
					providerEventId: 'evt_checkout',
					organizationId: 'org-1',
					subscription: state
				})
			).toBe('applied');
		}

		it('records an incomplete subscription that grants nothing until checkout completes', async () => {
			const result = await billing.subscribe({ ...ORG, planId: 'pro', interval: 'year' });
			expect(result).toEqual({ kind: 'redirect', url: 'https://pay.example/checkout' });

			expect(await billing.getSubscription('org-1')).toMatchObject({
				status: 'incomplete',
				planId: 'pro'
			});
			expect(await billing.entitlementsFor('org-1')).toEqual([]);
			expect(
				await db.selectFrom('billing_customers').select('provider_customer_id').executeTakeFirst()
			).toEqual({ provider_customer_id: 'cus_1' });
		});

		it('activates on the checkout webhook, matching the row by organization', async () => {
			await subscribeAndConfirm();
			expect(await billing.getSubscription('org-1')).toMatchObject({
				status: 'active',
				providerSubscriptionId: 'sub_ext_1',
				currentPeriodEnd: '2027-01-01T00:00:00.000Z'
			});
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);
		});

		it('applies a redelivered webhook once', async () => {
			await subscribeAndConfirm();
			const downgrade = {
				type: 'subscription.updated' as const,
				providerEventId: 'evt_downgrade',
				subscription: providerState({ planId: 'standard' })
			};
			expect(await billing.handleWebhook(downgrade)).toBe('applied');
			expect(await billing.handleWebhook(downgrade)).toBe('duplicate');
			expect(
				await db.selectFrom('billing_events').select('provider_event_id').execute()
			).toHaveLength(2);
			expect((await billing.getSubscription('org-1'))?.planId).toBe('standard');
		});

		it('ignores events for a subscription it does not know, and can apply them later', async () => {
			const event = {
				type: 'payment.failed' as const,
				providerEventId: 'evt_early',
				providerSubscriptionId: 'sub_unknown'
			};
			expect(await billing.handleWebhook(event)).toBe('ignored');
			// Unprocessed, so a redelivery is not mistaken for a duplicate.
			expect(await billing.handleWebhook(event)).toBe('ignored');
		});

		it('keeps entitlements for 30 days after a failed payment, then lapses', async () => {
			await subscribeAndConfirm();

			clock = new Date('2026-06-10T00:00:00Z');
			await billing.handleWebhook({
				type: 'payment.failed',
				providerEventId: 'evt_fail_1',
				providerSubscriptionId: 'sub_ext_1'
			});
			expect(await billing.getSubscription('org-1')).toMatchObject({
				status: 'past_due',
				graceEndsAt: '2026-07-10T00:00:00.000Z'
			});
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);

			// A second failure does not extend the deadline.
			clock = new Date('2026-06-20T00:00:00Z');
			await billing.handleWebhook({
				type: 'payment.failed',
				providerEventId: 'evt_fail_2',
				providerSubscriptionId: 'sub_ext_1'
			});
			expect((await billing.getSubscription('org-1'))?.graceEndsAt).toBe(
				'2026-07-10T00:00:00.000Z'
			);

			clock = new Date('2026-07-09T23:59:59Z');
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);
			clock = new Date('2026-07-10T00:00:00Z');
			expect(await billing.entitlementsFor('org-1')).toEqual([]);
		});

		it('clears the grace period when payment recovers', async () => {
			await subscribeAndConfirm();
			await billing.handleWebhook({
				type: 'payment.failed',
				providerEventId: 'evt_fail',
				providerSubscriptionId: 'sub_ext_1'
			});
			await billing.handleWebhook({
				type: 'subscription.updated',
				providerEventId: 'evt_paid',
				subscription: providerState({ status: 'active' })
			});
			expect(await billing.getSubscription('org-1')).toMatchObject({
				status: 'active',
				graceEndsAt: null
			});
		});

		it('ends access on a cancellation webhook', async () => {
			await subscribeAndConfirm();
			await billing.handleWebhook({
				type: 'subscription.canceled',
				providerEventId: 'evt_cancel',
				providerSubscriptionId: 'sub_ext_1'
			});
			expect(await billing.getSubscription('org-1')).toBeNull();
			expect(await billing.entitlementsFor('org-1')).toEqual([]);
		});

		it('leaves the plan alone until the processor confirms a hosted change', async () => {
			await subscribeAndConfirm(providerState({ planId: 'standard' }));
			expect(
				await billing.changePlan({ organizationId: 'org-1', planId: 'pro', interval: 'year' })
			).toEqual({ kind: 'redirect', url: 'https://pay.example/change' });
			expect((await billing.getSubscription('org-1'))?.planId).toBe('standard');
		});

		it('records cancel-at-period-end without ending access', async () => {
			await subscribeAndConfirm();
			const result = await billing.cancel('org-1', { atPeriodEnd: true });
			expect(result).toMatchObject({
				status: 'active',
				cancelAtPeriodEnd: true,
				currentPeriodEnd: '2026-12-31T00:00:00.000Z'
			});
			expect(await billing.entitlementsFor('org-1')).toEqual(['autogen']);
		});
	});
});
