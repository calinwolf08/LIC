import type { LayoutServerLoad } from './$types';
import { isTierTestingEnabled } from '$lib/server/billing/tier-testing';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.session?.user ?? undefined,
		organization: locals.organization ?? undefined,
		entitlements: locals.entitlements ?? [],
		/** TEMPORARY: show the Standard/Pro testing toggles (ENABLE_TIER_TESTING). */
		tierTesting: isTierTestingEnabled()
	};
};
