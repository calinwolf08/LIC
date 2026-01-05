import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// If user is authenticated, redirect to dashboard
	// This applies to all public routes: landing, login, register
	if (locals.session?.user) {
		throw redirect(302, '/dashboard');
	}

	return {};
};
