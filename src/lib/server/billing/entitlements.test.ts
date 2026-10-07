import { describe, expect, it } from 'vitest';
import { entitlementsForSubscription, isSubscriptionUsable, nextGraceEndsAt } from './entitlements';
import type { SubscriptionStatus } from './types';

const now = new Date('2026-06-15T12:00:00Z');
const later = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

function sub(status: SubscriptionStatus, planId = 'pro', graceEndsAt: string | null = null) {
	return { status, planId, graceEndsAt };
}

describe('isSubscriptionUsable', () => {
	it.each<[SubscriptionStatus, boolean]>([
		['active', true],
		['trialing', true],
		['incomplete', false],
		['canceled', false]
	])('%s → %s', (status, usable) => {
		expect(isSubscriptionUsable(sub(status), now)).toBe(usable);
	});

	it('keeps a past_due subscription usable until its grace period ends', () => {
		expect(isSubscriptionUsable(sub('past_due', 'pro', later(1)), now)).toBe(true);
		expect(isSubscriptionUsable(sub('past_due', 'pro', now.toISOString()), now)).toBe(false);
		expect(isSubscriptionUsable(sub('past_due', 'pro', later(-1)), now)).toBe(false);
	});

	it('treats a past_due subscription without a grace deadline as lapsed', () => {
		expect(isSubscriptionUsable(sub('past_due', 'pro', null), now)).toBe(false);
	});

	it('is false without a subscription', () => {
		expect(isSubscriptionUsable(null, now)).toBe(false);
	});
});

describe('entitlementsForSubscription', () => {
	it('grants the plan’s entitlements while usable', () => {
		expect(entitlementsForSubscription(sub('active', 'pro'), now)).toEqual(['autogen']);
		expect(entitlementsForSubscription(sub('active', 'standard'), now)).toEqual([]);
		expect(entitlementsForSubscription(sub('past_due', 'pro', later(29)), now)).toEqual([
			'autogen'
		]);
	});

	it('grants nothing once unusable', () => {
		expect(entitlementsForSubscription(sub('canceled', 'pro'), now)).toEqual([]);
		expect(entitlementsForSubscription(sub('incomplete', 'pro'), now)).toEqual([]);
		expect(entitlementsForSubscription(sub('past_due', 'pro', later(-1)), now)).toEqual([]);
		expect(entitlementsForSubscription(null, now)).toEqual([]);
	});

	it('grants nothing for a retired plan id', () => {
		expect(entitlementsForSubscription(sub('active', 'legacy-gold'), now)).toEqual([]);
	});

	it('returns a fresh array the caller may mutate', () => {
		const granted = entitlementsForSubscription(sub('active', 'pro'), now);
		granted.push('autogen');
		expect(entitlementsForSubscription(sub('active', 'pro'), now)).toEqual(['autogen']);
	});
});

describe('nextGraceEndsAt', () => {
	it('starts a 30-day grace period on entering past_due', () => {
		expect(nextGraceEndsAt({ status: 'active', graceEndsAt: null }, 'past_due', now)).toBe(
			later(30)
		);
		expect(nextGraceEndsAt(null, 'past_due', now)).toBe(later(30));
	});

	it('does not extend the deadline on a repeated failure', () => {
		const deadline = later(10);
		expect(nextGraceEndsAt({ status: 'past_due', graceEndsAt: deadline }, 'past_due', now)).toBe(
			deadline
		);
	});

	it('clears the deadline when the subscription leaves past_due', () => {
		for (const status of ['active', 'trialing', 'incomplete', 'canceled'] as const) {
			expect(
				nextGraceEndsAt({ status: 'past_due', graceEndsAt: later(5) }, status, now)
			).toBeNull();
		}
	});
});
