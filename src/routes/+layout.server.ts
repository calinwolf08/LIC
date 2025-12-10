import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PageSlugs } from '$lib/constants';
import { db } from '$lib/db';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {

    // Pages that don't require authentication
    const publicRoutes = [PageSlugs.login, PageSlugs.register];
    const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

    // Allow bypass during E2E testing
    const isE2ETesting = process.env.E2E_TESTING === 'true';

    // Check if the user is authenticated
    if (!locals.session?.user && !isPublicRoute && !isE2ETesting) {
        console.log('redirecting')
        throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    // Schedule-first architecture: Check if user has an active schedule
    // If not, redirect to create schedule (unless already on schedule pages or auth routes)
    const scheduleExemptRoutes = ['/schedules', '/login', '/register', '/api'];
    const isScheduleExemptRoute = scheduleExemptRoutes.some(route => url.pathname.startsWith(route));

    if (locals.session?.user && !isScheduleExemptRoute && !isE2ETesting) {
        const user = await db
            .selectFrom('user')
            .select('active_schedule_id')
            .where('id', '=', locals.session.user.id)
            .executeTakeFirst();

        // Check if user has schedules accessible to them
        if (!user?.active_schedule_id) {
            const hasSchedules = await db
                .selectFrom('scheduling_periods')
                .select('id')
                .where((eb) =>
                    eb.or([
                        eb('user_id', '=', locals.session!.user.id),
                        eb('user_id', 'is', null)
                    ])
                )
                .limit(1)
                .executeTakeFirst();

            if (!hasSchedules) {
                // No schedules - redirect to create one
                throw redirect(302, '/schedules/new');
            }
        }
    }

    return {
        user: locals.session?.user ?? undefined,
    };
};

