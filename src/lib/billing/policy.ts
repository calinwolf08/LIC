/**
 * Billing policy knobs. Arbitrary for now; one place to change them.
 */

/**
 * How long a `past_due` subscription keeps its plan's entitlements after the
 * payment failure, before the organization loses them.
 */
export const BILLING_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a grace period that starts at `from` ends. */
export function graceEndsAt(from: Date): Date {
	return new Date(from.getTime() + BILLING_GRACE_DAYS * DAY_MS);
}
