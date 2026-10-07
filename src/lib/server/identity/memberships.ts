/**
 * Provider-neutral organization helpers.
 */

import type { OrgMembership } from './types';

/**
 * The membership a request acts under: the session's active organization when
 * the user still belongs to it, otherwise their oldest membership, otherwise
 * none. A stale or forged `activeOrganizationId` therefore never grants access.
 *
 * @param memberships the user's memberships, oldest first (as `listMemberships` returns them)
 */
export function pickActiveMembership(
	memberships: readonly OrgMembership[],
	activeOrganizationId: string | null
): OrgMembership | null {
	if (activeOrganizationId) {
		const active = memberships.find((m) => m.organizationId === activeOrganizationId);
		if (active) return active;
	}
	return memberships[0] ?? null;
}

/**
 * A URL-safe slug for an organization name, with a random suffix so two
 * programs with the same name never collide on the provider's unique slug.
 */
export function organizationSlug(name: string, suffix = randomSuffix()): string {
	const base = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
		.replace(/-+$/g, '');
	return base ? `${base}-${suffix}` : `org-${suffix}`;
}

function randomSuffix(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}
