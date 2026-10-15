/**
 * Choose the payment provider from the environment.
 *
 *   PAYMENT_PROVIDER=manual   (default) no processor; plans activate for free
 *
 * An unknown value fails at startup rather than silently billing nobody.
 */

import type { PaymentProvider } from '../types';
import { createManualProvider, MANUAL_PROVIDER_ID } from './manual';

const factories: Record<string, () => PaymentProvider> = {
	[MANUAL_PROVIDER_ID]: createManualProvider
};

export function getPaymentProvider(
	env: Record<string, string | undefined> = process.env
): PaymentProvider {
	const id = env.PAYMENT_PROVIDER?.trim() || MANUAL_PROVIDER_ID;
	const factory = factories[id];
	if (!factory) {
		throw new Error(
			`Unknown PAYMENT_PROVIDER '${id}'. Supported: ${Object.keys(factories).join(', ')}`
		);
	}
	return factory();
}

export { MANUAL_PROVIDER_ID } from './manual';
