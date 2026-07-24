import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.session?.user ?? undefined,
		entitlements: locals.entitlements ?? []
	};
};
