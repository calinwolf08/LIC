import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.session?.user ?? undefined,
		organization: locals.organization ?? undefined,
		entitlements: locals.entitlements ?? []
	};
};
