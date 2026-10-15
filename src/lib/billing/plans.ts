/**
 * The plan catalog — shared by server and client (pricing page, register form,
 * billing settings).
 *
 * Plans live in code, not the database: what a plan includes is product logic
 * the app must agree with, and changing it is a deploy. Payment processors map
 * `(planId, interval)` to their own price ids inside their provider adapter, so
 * nothing here depends on a processor.
 */

/** Stage 2: constraint-based auto-generation (`/generate` and its APIs). */
export const ENTITLEMENT_AUTOGEN = 'autogen';

export const ENTITLEMENTS = [ENTITLEMENT_AUTOGEN] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

export const PLAN_IDS = ['standard', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/**
 * How a plan is priced. Today every plan is enterprise-style "contact us";
 * switching a plan to `listed` is a catalog edit, not a schema change.
 */
export type PlanPricing =
	| { readonly kind: 'contact' }
	| {
			readonly kind: 'listed';
			readonly prices: Readonly<
				Record<BillingInterval, { readonly amountCents: number; readonly currency: 'usd' }>
			>;
	  };

export interface Plan {
	readonly id: PlanId;
	readonly name: string;
	readonly description: string;
	/** Human-readable highlights for plan cards. */
	readonly highlights: readonly string[];
	/** What the plan unlocks in the app. */
	readonly entitlements: readonly Entitlement[];
	readonly pricing: PlanPricing;
	/** Orders plans for upgrade/downgrade wording: higher includes more. */
	readonly rank: number;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
	standard: {
		id: 'standard',
		name: 'Standard',
		description: 'Build and manage LIC schedules by hand with real-time validation.',
		highlights: [
			'Students, preceptors, clerkships and sites',
			'Manual scheduling with conflict validation',
			'Requirement tracking per student',
			'Excel export'
		],
		entitlements: [],
		pricing: { kind: 'contact' },
		rank: 0
	},
	pro: {
		id: 'pro',
		name: 'Pro',
		description: 'Everything in Standard, plus automatic schedule generation.',
		highlights: [
			'Everything in Standard',
			'Auto-generate and optimize schedules',
			'Violation diagnostics',
			'Teams, backup preceptors and per-clerkship strategies'
		],
		entitlements: [ENTITLEMENT_AUTOGEN],
		pricing: { kind: 'contact' },
		rank: 1
	}
};

/** Plans in display order (lowest rank first). */
export const PLAN_LIST: readonly Plan[] = Object.values(PLANS).sort((a, b) => a.rank - b.rank);

export const DEFAULT_PLAN_ID: PlanId = 'standard';
/** Contact-priced plans are negotiated; annual is the institutional norm. */
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'year';

export function isPlanId(value: unknown): value is PlanId {
	return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
	return typeof value === 'string' && (BILLING_INTERVALS as readonly string[]).includes(value);
}

/**
 * Where "Contact us for pricing" points. A placeholder until sales has a real
 * address or form — set PUBLIC_SALES_CONTACT_EMAIL to override.
 */
export const SALES_CONTACT_PLACEHOLDER_EMAIL = 'sales@example.com';

export function salesContactHref(email: string | undefined = undefined): string {
	return `mailto:${email || SALES_CONTACT_PLACEHOLDER_EMAIL}`;
}
