import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PageSlugs } from '$lib/constants';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {

    // Pages that don't require authentication
    const publicRoutes = [PageSlugs.login, PageSlugs.register];
    const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

    // Allow bypass during E2E testing
    const isE2ETesting = process.env.E2E_TESTING === 'true';

    console.log('session')
    console.log(locals.session);

    // Check if the user is authenticated
    if (!locals.session?.user && !isPublicRoute && !isE2ETesting) {
        console.log('redirecting')
        throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    return {
        user: locals.session?.user ?? undefined,
    };
};

