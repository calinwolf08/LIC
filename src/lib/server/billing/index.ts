/**
 * The application's billing service, over the configured payment provider
 * (PAYMENT_PROVIDER, default `manual`).
 */

import type { Kysely } from 'kysely';
import { db } from '../../db/connection';
import type { DB } from '../../db/types';
import { getPaymentProvider } from './providers';
import { createBillingService, type BillingService } from './service';

export * from './types';
export type { BillingService, SubscribeResult, WebhookOutcome } from './service';
export { entitlementsForSubscription, isSubscriptionUsable } from './entitlements';

export const billing: BillingService = createBillingService({ db, provider: getPaymentProvider() });

/** A billing service over another database — for scripts and tests. */
export function createBilling(database: { db: Kysely<DB> }): BillingService {
	return createBillingService({ db: database.db, provider: getPaymentProvider() });
}
