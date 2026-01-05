import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/db';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Require authentication for all app routes
	if (!locals.session?.user) {
		throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	// Allow bypass during E2E testing for schedule-related checks only
	const isE2ETesting = process.env.E2E_TESTING === 'true';

	// Schedule-first architecture: Check if user has an active schedule
	// If not, redirect to create schedule (unless already on schedule pages)
	const scheduleExemptRoutes = ['/schedules'];
	const isScheduleExemptRoute = scheduleExemptRoutes.some(route => url.pathname.startsWith(route));

	if (!isScheduleExemptRoute && !isE2ETesting) {
		try {
			const user = await db
				.selectFrom('user')
				.select('active_schedule_id')
				.where('id', '=', locals.session.user.id)
				.executeTakeFirst();

			// Check if user has their own schedules (not including orphan schedules)
			if (!user?.active_schedule_id) {
				const hasSchedules = await db
					.selectFrom('scheduling_periods')
					.select('id')
					.where('user_id', '=', locals.session.user.id)
					.limit(1)
					.executeTakeFirst();

				if (!hasSchedules) {
					// No schedules - redirect to create one
					throw redirect(302, '/schedules/new');
				}
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes('active_schedule_id')) {
				console.warn('active_schedule_id column missing - run npm run db:migrate');
			} else if ((error as any)?.status === 302) {
				throw error;
			} else {
				console.error('Error checking user schedule:', error);
			}
		}
	}

	return {
		user: locals.session.user
	};
};
