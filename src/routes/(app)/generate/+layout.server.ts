import type { LayoutServerLoad } from './$types';
import { requireAutogen } from '$lib/server/entitlements';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Gate the entire Auto-Generate area server-side.
	requireAutogen(locals);
	return {};
};
