import { describe, it, expect } from 'vitest';
import { parseEntitlements, hasAutogen, requireAutogen, ENTITLEMENT_AUTOGEN } from './entitlements';

function locals(entitlements: string[]): App.Locals {
	return { session: null, entitlements } as App.Locals;
}

describe('parseEntitlements', () => {
	it('parses a valid JSON array of strings', () => {
		expect(parseEntitlements('["autogen"]')).toEqual(['autogen']);
	});

	it('returns [] for empty / missing input', () => {
		expect(parseEntitlements('')).toEqual([]);
		expect(parseEntitlements(undefined)).toEqual([]);
		expect(parseEntitlements(null)).toEqual([]);
	});

	it('returns [] for malformed JSON', () => {
		expect(parseEntitlements('not json')).toEqual([]);
		expect(parseEntitlements('{')).toEqual([]);
	});

	it('returns [] when JSON is not an array', () => {
		expect(parseEntitlements('"autogen"')).toEqual([]);
		expect(parseEntitlements('{"autogen":true}')).toEqual([]);
	});

	it('filters out non-string members', () => {
		expect(parseEntitlements('["autogen", 1, null, "x"]')).toEqual(['autogen', 'x']);
	});
});

describe('hasAutogen', () => {
	it('is true when the autogen entitlement is present', () => {
		expect(hasAutogen(locals([ENTITLEMENT_AUTOGEN]))).toBe(true);
	});

	it('is false when absent', () => {
		expect(hasAutogen(locals([]))).toBe(false);
		expect(hasAutogen(locals(['other']))).toBe(false);
	});

	it('is false when entitlements is undefined', () => {
		expect(hasAutogen({ session: null } as App.Locals)).toBe(false);
	});
});

describe('requireAutogen', () => {
	it('does not throw for entitled users', () => {
		expect(() => requireAutogen(locals([ENTITLEMENT_AUTOGEN]))).not.toThrow();
	});

	it('throws a 403 for non-entitled users', () => {
		try {
			requireAutogen(locals([]));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect((err as { status?: number }).status).toBe(403);
		}
	});
});
