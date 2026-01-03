import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { PageSlugs } from '$lib/constants';
import { db } from '$lib/db';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {

    // Pages that don't require authentication
    const publicRoutes = [PageSlugs.login, PageSlugs.register];
    const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route));

    // Check if the user is authenticated (E2E tests use real auth flows)
    if (!locals.session?.user && !isPublicRoute) {
        console.log('redirecting')
        throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
    }

    // Allow bypass during E2E testing for schedule-related checks only
    const isE2ETesting = process.env.E2E_TESTING === 'true';

    // Schedule-first architecture: Check if user has an active schedule
    // If not, redirect to create schedule (unless already on schedule pages or auth routes)
    const scheduleExemptRoutes = ['/schedules', '/login', '/register', '/api'];
    const isScheduleExemptRoute = scheduleExemptRoutes.some(route => url.pathname.startsWith(route));

    if (locals.session?.user && !isScheduleExemptRoute && !isE2ETesting) {
        try {
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
        } catch (error) {
            // Handle case where active_schedule_id column doesn't exist yet
            // This can happen if user table was created after migration 023 ran
            if (error instanceof Error && error.message.includes('active_schedule_id')) {
                console.warn('active_schedule_id column missing - run npm run db:migrate');
                // Don't block the user, just skip the schedule check
            } else if ((error as any)?.status === 302) {
                // Re-throw redirects
                throw error;
            } else {
                console.error('Error checking user schedule:', error);
            }
        }
    }

    return {
        user: locals.session?.user ?? undefined,
    };
};

