import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PageSlugs } from '$lib/constants';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {

    // Pages that don't require authentication
    const publicRoutes = [PageSlugs.login];
    const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

    console.log('session')
    console.log(locals.session);

    // Check if the user is authenticated
    if (!locals.session?.user && !isPublicRoute) {
        console.log('redirecting')
        throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    return {
        user: locals.session?.user ?? undefined,
    };
};

