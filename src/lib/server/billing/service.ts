/**
 * BillingService — the only code that writes the billing tables.
 *
 * It asks the configured `PaymentProvider` to act at the processor and records
 * the outcome. Providers never touch the database; routes never touch the
 * provider directly.
 *
 * Imports are relative: setup scripts run under plain `tsx`.
 */

import type { Kysely, Selectable, Transaction } from 'kysely';
import type { BillingInterval, Entitlement, PlanId } from '../../billing/plans';
import type { DB, Subscriptions } from '../../db/types';
import { entitlementsForSubscription, nextGraceEndsAt } from './entitlements';
import {
	BillingError,
	isSubscriptionStatus,
	type BillingEvent,
	type PaymentProvider,
	type ProviderSubscription,
	type ReturnUrls,
	type SubscriptionRecord
} from './types';

export type SubscribeResult =
	| { kind: 'active'; subscription: SubscriptionRecord }
	| { kind: 'redirect'; url: string };

export type WebhookOutcome = 'applied' | 'duplicate' | 'ignored';

export interface BillingService {
	readonly providerId: string;

	/** The organization's live (non-canceled) subscription, if any. */
	getSubscription(organizationId: string): Promise<SubscriptionRecord | null>;

	/** What the organization's subscription grants right now. */
	entitlementsFor(organizationId: string): Promise<Entitlement[]>;

	/**
	 * Start the organization's first (or next, after cancellation) subscription.
	 * @throws BillingError('already_subscribed') when a live one exists
	 */
	subscribe(input: {
		organizationId: string;
		organizationName: string;
		billingEmail: string;
		planId: PlanId;
		interval: BillingInterval;
		returnUrls?: ReturnUrls;
	}): Promise<SubscribeResult>;

	/**
	 * Move the live subscription to another plan or interval.
	 * @throws BillingError('no_subscription' | 'no_change' | 'provider_mismatch')
	 */
	changePlan(input: {
		organizationId: string;
		planId: PlanId;
		interval: BillingInterval;
		returnUrls?: ReturnUrls;
	}): Promise<SubscribeResult>;

	/** @throws BillingError('no_subscription' | 'provider_mismatch') */
	cancel(organizationId: string, options: { atPeriodEnd: boolean }): Promise<SubscriptionRecord>;

	/** Record a provider webhook and apply it, once. */
	handleWebhook(event: BillingEvent): Promise<WebhookOutcome>;
}

type Conn = Kysely<DB> | Transaction<DB>;

function toRecord(row: Selectable<Subscriptions>): SubscriptionRecord {
	if (!isSubscriptionStatus(row.status)) {
		throw new Error(`Subscription ${row.id} has unknown status '${row.status}'`);
	}
	if (row.billing_interval !== 'month' && row.billing_interval !== 'year') {
		throw new Error(`Subscription ${row.id} has unknown interval '${row.billing_interval}'`);
	}
	return {
		id: row.id,
		organizationId: row.organization_id,
		planId: row.plan_id,
		interval: row.billing_interval,
		status: row.status,
		provider: row.provider,
		providerSubscriptionId: row.provider_subscription_id,
		currentPeriodEnd: row.current_period_end,
		graceEndsAt: row.grace_ends_at,
		cancelAtPeriodEnd: row.cancel_at_period_end === 1
	};
}

export function createBillingService({
	db,
	provider,
	now = () => new Date()
}: {
	db: Kysely<DB>;
	provider: PaymentProvider;
	/** Injectable clock, for grace-period tests. */
	now?: () => Date;
}): BillingService {
	async function liveRow(conn: Conn, organizationId: string) {
		return conn
			.selectFrom('subscriptions')
			.selectAll()
			.where('organization_id', '=', organizationId)
			.where('status', '<>', 'canceled')
			.executeTakeFirst();
	}

	async function getSubscription(organizationId: string) {
		const row = await liveRow(db, organizationId);
		return row ? toRecord(row) : null;
	}

	/** Write a provider-reported state onto an existing row; returns the new record. */
	async function applyProviderState(
		conn: Conn,
		existing: SubscriptionRecord,
		state: Partial<ProviderSubscription> & Pick<ProviderSubscription, 'status'>
	): Promise<SubscriptionRecord> {
		const at = now();
		await conn
			.updateTable('subscriptions')
			.set({
				...(state.planId ? { plan_id: state.planId } : {}),
				...(state.interval ? { billing_interval: state.interval } : {}),
				...(state.providerSubscriptionId !== undefined && state.providerSubscriptionId !== null
					? { provider_subscription_id: state.providerSubscriptionId }
					: {}),
				...(state.currentPeriodEnd !== undefined
					? { current_period_end: state.currentPeriodEnd?.toISOString() ?? null }
					: {}),
				...(state.cancelAtPeriodEnd !== undefined
					? { cancel_at_period_end: state.cancelAtPeriodEnd ? 1 : 0 }
					: {}),
				status: state.status,
				grace_ends_at: nextGraceEndsAt(existing, state.status, at),
				updated_at: at.toISOString()
			})
			.where('id', '=', existing.id)
			.execute();
		const row = await conn
			.selectFrom('subscriptions')
			.selectAll()
			.where('id', '=', existing.id)
			.executeTakeFirstOrThrow();
		return toRecord(row);
	}

	async function upsertCustomer(organizationId: string, providerCustomerId: string | null) {
		const at = now().toISOString();
		const existing = await db
			.selectFrom('billing_customers')
			.select('id')
			.where('organization_id', '=', organizationId)
			.executeTakeFirst();
		if (existing) {
			await db
				.updateTable('billing_customers')
				.set({ provider: provider.id, provider_customer_id: providerCustomerId, updated_at: at })
				.where('id', '=', existing.id)
				.execute();
		} else {
			await db
				.insertInto('billing_customers')
				.values({
					id: crypto.randomUUID(),
					organization_id: organizationId,
					provider: provider.id,
					provider_customer_id: providerCustomerId,
					created_at: at,
					updated_at: at
				})
				.execute();
		}
	}

	function assertOwnProvider(subscription: SubscriptionRecord) {
		if (subscription.provider !== provider.id) {
			throw new BillingError(
				'provider_mismatch',
				`Subscription is managed by '${subscription.provider}', not '${provider.id}'`
			);
		}
	}

	return {
		providerId: provider.id,

		getSubscription,

		async entitlementsFor(organizationId) {
			return entitlementsForSubscription(await getSubscription(organizationId), now());
		},

		async subscribe(input) {
			if (await liveRow(db, input.organizationId)) {
				throw new BillingError('already_subscribed', 'The organization already has a subscription');
			}

			const customer = await db
				.selectFrom('billing_customers')
				.select(['provider', 'provider_customer_id'])
				.where('organization_id', '=', input.organizationId)
				.executeTakeFirst();
			const { providerCustomerId } = await provider.ensureCustomer({
				organizationId: input.organizationId,
				organizationName: input.organizationName,
				billingEmail: input.billingEmail,
				existingCustomerId:
					customer?.provider === provider.id ? customer.provider_customer_id : null
			});
			await upsertCustomer(input.organizationId, providerCustomerId);

			const started = await provider.startSubscription({
				organizationId: input.organizationId,
				providerCustomerId,
				planId: input.planId,
				interval: input.interval,
				returnUrls: input.returnUrls
			});

			const at = now();
			const state: ProviderSubscription =
				started.kind === 'activated'
					? started.subscription
					: {
							// Checkout not finished yet: grants nothing until the provider's
							// webhook reports the real state.
							providerSubscriptionId: null,
							planId: input.planId,
							interval: input.interval,
							status: 'incomplete',
							currentPeriodEnd: null,
							cancelAtPeriodEnd: false
						};
			const id = crypto.randomUUID();
			await db
				.insertInto('subscriptions')
				.values({
					id,
					organization_id: input.organizationId,
					plan_id: state.planId,
					billing_interval: state.interval,
					status: state.status,
					provider: provider.id,
					provider_subscription_id: state.providerSubscriptionId,
					current_period_end: state.currentPeriodEnd?.toISOString() ?? null,
					grace_ends_at: nextGraceEndsAt(null, state.status, at),
					cancel_at_period_end: state.cancelAtPeriodEnd ? 1 : 0,
					created_at: at.toISOString(),
					updated_at: at.toISOString()
				})
				.execute();

			if (started.kind === 'redirect') return { kind: 'redirect', url: started.url };
			const created = await getSubscription(input.organizationId);
			if (!created) throw new Error('Subscription vanished after insert');
			return { kind: 'active', subscription: created };
		},

		async changePlan(input) {
			const current = await getSubscription(input.organizationId);
			if (!current) {
				throw new BillingError('no_subscription', 'The organization has no subscription');
			}
			assertOwnProvider(current);
			if (current.planId === input.planId && current.interval === input.interval) {
				throw new BillingError('no_change', 'The organization is already on that plan');
			}

			const changed = await provider.changeSubscription({
				subscription: current,
				planId: input.planId,
				interval: input.interval,
				returnUrls: input.returnUrls
			});
			// A hosted flow reports the change later, by webhook.
			if (changed.kind === 'redirect') return { kind: 'redirect', url: changed.url };
			return {
				kind: 'active',
				subscription: await applyProviderState(db, current, changed.subscription)
			};
		},

		async cancel(organizationId, { atPeriodEnd }) {
			const current = await getSubscription(organizationId);
			if (!current) {
				throw new BillingError('no_subscription', 'The organization has no subscription');
			}
			assertOwnProvider(current);
			const state = await provider.cancelSubscription({ subscription: current, atPeriodEnd });
			return applyProviderState(db, current, state);
		},

		async handleWebhook(event) {
			const recorded = await db
				.selectFrom('billing_events')
				.select(['id', 'processed_at'])
				.where('provider', '=', provider.id)
				.where('provider_event_id', '=', event.providerEventId)
				.executeTakeFirst();
			if (recorded?.processed_at) return 'duplicate';

			const eventRowId = recorded?.id ?? crypto.randomUUID();
			if (!recorded) {
				try {
					await db
						.insertInto('billing_events')
						.values({
							id: eventRowId,
							provider: provider.id,
							provider_event_id: event.providerEventId,
							type: event.type,
							payload: JSON.stringify(event),
							created_at: now().toISOString()
						})
						.execute();
				} catch (error) {
					// A concurrent delivery of the same event won the unique index.
					const raced = await db
						.selectFrom('billing_events')
						.select('id')
						.where('provider', '=', provider.id)
						.where('provider_event_id', '=', event.providerEventId)
						.executeTakeFirst();
					if (raced) return 'duplicate';
					throw error;
				}
			}

			const providerSubscriptionId =
				event.type === 'subscription.updated'
					? event.subscription.providerSubscriptionId
					: event.providerSubscriptionId;

			const outcome = await db.transaction().execute(async (trx) => {
				let row = await trx
					.selectFrom('subscriptions')
					.selectAll()
					.where('provider', '=', provider.id)
					.where('provider_subscription_id', '=', providerSubscriptionId)
					.executeTakeFirst();
				// First event after a hosted checkout: the row has no provider id yet.
				if (!row && event.type === 'subscription.updated' && event.organizationId) {
					row = await liveRow(trx, event.organizationId);
				}
				if (!row) return 'ignored' as const;

				const existing = toRecord(row);
				switch (event.type) {
					case 'subscription.updated':
						await applyProviderState(trx, existing, event.subscription);
						break;
					case 'subscription.canceled':
						await applyProviderState(trx, existing, { status: 'canceled' });
						break;
					case 'payment.failed':
						await applyProviderState(trx, existing, { status: 'past_due' });
						break;
				}
				await trx
					.updateTable('billing_events')
					.set({ processed_at: now().toISOString() })
					.where('id', '=', eventRowId)
					.execute();
				return 'applied' as const;
			});
			return outcome;
		}
	};
}
