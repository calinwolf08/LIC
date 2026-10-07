import { describe, expect, it } from 'vitest';
import {
	BILLING_INTERVALS,
	DEFAULT_BILLING_INTERVAL,
	DEFAULT_PLAN_ID,
	ENTITLEMENT_AUTOGEN,
	isBillingInterval,
	isPlanId,
	PLAN_IDS,
	PLAN_LIST,
	PLANS,
	salesContactHref
} from './plans';
import { BILLING_GRACE_DAYS, graceEndsAt } from './policy';

describe('plan catalog', () => {
	it('keys every plan by its own id', () => {
		expect(Object.keys(PLANS).sort()).toEqual([...PLAN_IDS].sort());
		for (const id of PLAN_IDS) expect(PLANS[id].id).toBe(id);
	});

	it('lists plans in strictly increasing rank', () => {
		const ranks = PLAN_LIST.map((p) => p.rank);
		expect(new Set(ranks).size).toBe(ranks.length);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('gives every higher plan everything a lower plan has', () => {
		for (let i = 1; i < PLAN_LIST.length; i++) {
			expect(PLAN_LIST[i].entitlements).toEqual(
				expect.arrayContaining([...PLAN_LIST[i - 1].entitlements])
			);
		}
	});

	it('puts auto-generation in Pro only', () => {
		expect(PLANS.pro.entitlements).toContain(ENTITLEMENT_AUTOGEN);
		expect(PLANS.standard.entitlements).not.toContain(ENTITLEMENT_AUTOGEN);
	});

	it('prices every interval of a listed plan', () => {
		const unpriced = PLAN_LIST.filter(
			(plan) =>
				plan.pricing.kind === 'listed' &&
				BILLING_INTERVALS.some(
					(interval) => !(plan.pricing.kind === 'listed' && plan.pricing.prices[interval])
				)
		);
		expect(unpriced.map((plan) => plan.id)).toEqual([]);
	});

	it('is contact-for-pricing today', () => {
		for (const plan of PLAN_LIST) expect(plan.pricing.kind).toBe('contact');
	});

	it('defaults to a real plan and interval', () => {
		expect(isPlanId(DEFAULT_PLAN_ID)).toBe(true);
		expect(isBillingInterval(DEFAULT_BILLING_INTERVAL)).toBe(true);
	});

	it('guards plan ids and intervals', () => {
		expect(isPlanId('pro')).toBe(true);
		expect(isPlanId('enterprise')).toBe(false);
		expect(isPlanId(undefined)).toBe(false);
		expect(isBillingInterval('month')).toBe(true);
		expect(isBillingInterval('week')).toBe(false);
	});

	it('points "contact us" at a placeholder until configured', () => {
		expect(salesContactHref()).toBe('mailto:sales@example.com');
		expect(salesContactHref('')).toBe('mailto:sales@example.com');
		expect(salesContactHref('deals@lic.example')).toBe('mailto:deals@lic.example');
	});
});

describe('billing policy', () => {
	it('grants a 30-day grace period', () => {
		expect(BILLING_GRACE_DAYS).toBe(30);
		expect(graceEndsAt(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe(
			'2026-01-31T00:00:00.000Z'
		);
	});
});
