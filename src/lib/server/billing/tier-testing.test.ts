import { describe, expect, it } from 'vitest';
import { isTierTestingEnabled } from './tier-testing';

describe('isTierTestingEnabled', () => {
	it('is on only for ENABLE_TIER_TESTING=true (any case, trimmed)', () => {
		expect(isTierTestingEnabled({ ENABLE_TIER_TESTING: 'true' })).toBe(true);
		expect(isTierTestingEnabled({ ENABLE_TIER_TESTING: ' TRUE ' })).toBe(true);
	});

	it('is off when unset or set to anything else', () => {
		expect(isTierTestingEnabled({})).toBe(false);
		expect(isTierTestingEnabled({ ENABLE_TIER_TESTING: '' })).toBe(false);
		expect(isTierTestingEnabled({ ENABLE_TIER_TESTING: 'false' })).toBe(false);
		expect(isTierTestingEnabled({ ENABLE_TIER_TESTING: '1' })).toBe(false);
	});
});
