/**
 * Billing domain types, provider-neutral.
 *
 * Imports are relative (no `$lib`): setup scripts run under plain `tsx`.
 */

import type { BillingInterval, PlanId } from '../../billing/plans';

export const SUBSCRIPTION_STATUSES = [
	'active',
	'trialing',
	'past_due',
	'incomplete',
	'canceled'
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
	return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/** An organization's subscription, as the app stores it. */
export interface SubscriptionRecord {
	readonly id: string;
	readonly organizationId: string;
	/** A catalog plan id — or an unknown string from a retired plan, which grants nothing. */
	readonly planId: string;
	readonly interval: BillingInterval;
	readonly status: SubscriptionStatus;
	readonly provider: string;
	readonly providerSubscriptionId: string | null;
	/** ISO-8601; null when the provider has no billing period (manual). */
	readonly currentPeriodEnd: string | null;
	/** ISO-8601; set while `past_due`, when entitlements lapse. */
	readonly graceEndsAt: string | null;
	readonly cancelAtPeriodEnd: boolean;
}

/** A subscription's state as a payment provider reports it. */
export interface ProviderSubscription {
	readonly providerSubscriptionId: string | null;
	readonly planId: PlanId;
	readonly interval: BillingInterval;
	readonly status: SubscriptionStatus;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
}

/** Where a hosted checkout sends the user back to. */
export interface ReturnUrls {
	readonly success: string;
	readonly cancel: string;
}

/**
 * A provider webhook, normalized. Each carries the provider's event id so a
 * redelivery is recognised and applied once.
 */
export type BillingEvent =
	| {
			readonly type: 'subscription.updated';
			readonly providerEventId: string;
			/**
			 * The organization the subscription belongs to, when the provider echoes
			 * it back (e.g. checkout metadata). Lets the first event after a hosted
			 * checkout find the `incomplete` row before it has a provider id.
			 */
			readonly organizationId?: string;
			readonly subscription: ProviderSubscription & { readonly providerSubscriptionId: string };
	  }
	| {
			readonly type: 'subscription.canceled';
			readonly providerEventId: string;
			readonly providerSubscriptionId: string;
	  }
	| {
			readonly type: 'payment.failed';
			readonly providerEventId: string;
			readonly providerSubscriptionId: string;
	  };

/**
 * A payment processor. Implementations: `ManualProvider` (no processor; every
 * subscription is active immediately and free) and, later, Stripe.
 *
 * Providers never touch the database: they talk to the processor and report
 * back; `BillingService` owns the billing tables.
 */
export interface PaymentProvider {
	/** Stored in `subscriptions.provider` / `billing_customers.provider`. */
	readonly id: string;

	/** Create (or confirm) the processor's customer for an organization. */
	ensureCustomer(input: {
		organizationId: string;
		organizationName: string;
		billingEmail: string;
		existingCustomerId: string | null;
	}): Promise<{ providerCustomerId: string | null }>;

	/** Start a subscription: active now, or the user must complete a hosted checkout. */
	startSubscription(input: {
		organizationId: string;
		providerCustomerId: string | null;
		planId: PlanId;
		interval: BillingInterval;
		returnUrls?: ReturnUrls;
	}): Promise<
		{ kind: 'activated'; subscription: ProviderSubscription } | { kind: 'redirect'; url: string }
	>;

	/** Move a subscription to another plan or interval. */
	changeSubscription(input: {
		subscription: SubscriptionRecord;
		planId: PlanId;
		interval: BillingInterval;
		returnUrls?: ReturnUrls;
	}): Promise<
		{ kind: 'updated'; subscription: ProviderSubscription } | { kind: 'redirect'; url: string }
	>;

	/** Cancel now, or at the end of the current billing period. */
	cancelSubscription(input: {
		subscription: SubscriptionRecord;
		atPeriodEnd: boolean;
	}): Promise<Pick<ProviderSubscription, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>>;

	/** The processor's hosted "manage payment method / invoices" page; null if unsupported. */
	getCustomerPortalUrl(input: {
		providerCustomerId: string;
		returnUrl: string;
	}): Promise<string | null>;

	/**
	 * Verify and normalize a webhook request.
	 * @returns null for events the app ignores
	 * @throws when the request is not authentic (bad signature)
	 */
	parseWebhook(request: Request): Promise<BillingEvent | null>;
}

export type BillingErrorCode =
	| 'already_subscribed'
	| 'no_subscription'
	| 'no_change'
	| 'provider_mismatch';

/** A billing request the current state does not allow. */
export class BillingError extends Error {
	constructor(
		readonly code: BillingErrorCode,
		message: string
	) {
		super(message);
		this.name = 'BillingError';
	}
}
