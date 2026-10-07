import { describe, expect, it } from 'vitest';
import { organizationSlug, pickActiveMembership } from './memberships';
import type { OrgMembership } from './types';

const first: OrgMembership = { organizationId: 'org-1', organizationName: 'First', role: 'owner' };
const second: OrgMembership = {
	organizationId: 'org-2',
	organizationName: 'Second',
	role: 'admin'
};

describe('pickActiveMembership', () => {
	it('uses the session’s active organization when the user still belongs to it', () => {
		expect(pickActiveMembership([first, second], 'org-2')).toBe(second);
	});

	it('falls back to the oldest membership when the active organization is stale', () => {
		expect(pickActiveMembership([first, second], 'org-gone')).toBe(first);
	});

	it('falls back to the oldest membership when none is active', () => {
		expect(pickActiveMembership([first, second], null)).toBe(first);
	});

	it('returns null without memberships, whatever the session claims', () => {
		expect(pickActiveMembership([], 'org-1')).toBeNull();
		expect(pickActiveMembership([], null)).toBeNull();
	});
});

describe('organizationSlug', () => {
	it('lower-cases, dashes and suffixes the name', () => {
		expect(organizationSlug('University Medical School LIC', 'abc123')).toBe(
			'university-medical-school-lic-abc123'
		);
	});

	it('strips accents and punctuation, and trims dashes', () => {
		expect(organizationSlug("  Hôpital Saint-Éloi's Program! ", 'x')).toBe(
			'hopital-saint-eloi-s-program-x'
		);
	});

	it('falls back when the name has no slug-able characters', () => {
		expect(organizationSlug('!!!', 'x')).toBe('org-x');
	});

	it('caps the readable part so the slug stays short', () => {
		const slug = organizationSlug('a'.repeat(200), 'x');
		expect(slug).toBe(`${'a'.repeat(48)}-x`);
	});

	it('generates a random suffix by default, so equal names do not collide', () => {
		expect(organizationSlug('Same Name')).not.toBe(organizationSlug('Same Name'));
		expect(organizationSlug('Same Name')).toMatch(/^same-name-[0-9a-f]{8}$/);
	});
});
