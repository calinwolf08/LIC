/**
 * Schedules List Page - Server Load
 *
 * Loads all schedules for the current user (or all if no auth)
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ locals }) => {
	const session = locals.session;
	const userId = session?.user?.id;

	// Get all schedules owned by the user
	// Only show schedules that belong to this user (not orphaned schedules)
	let query = db.selectFrom('scheduling_periods').selectAll();

	if (userId) {
		// Only show schedules owned by this user
		query = query.where('user_id', '=', userId);
	} else {
		// No user - show no schedules (shouldn't happen in authenticated routes)
		query = query.where('id', '=', '__no_match__');
	}

	const schedules = await query.orderBy('start_date', 'desc').execute();

	// Get user's active schedule ID
	let activeScheduleId: string | null = null;
	if (userId) {
		try {
			const user = await db
				.selectFrom('user')
				.select('active_schedule_id')
				.where('id', '=', userId)
				.executeTakeFirst();
			activeScheduleId = user?.active_schedule_id || null;
		} catch (error) {
			// Handle case where active_schedule_id column doesn't exist
			if (error instanceof Error && error.message.includes('active_schedule_id')) {
				console.warn('active_schedule_id column missing - run npm run db:migrate');
			} else {
				throw error;
			}
		}
	}

	// Get entity counts for each schedule
	const schedulesWithCounts = await Promise.all(
		schedules.map(async (schedule) => {
			const [students, preceptors, clerkships] = await Promise.all([
				db
					.selectFrom('schedule_students')
					.select(db.fn.count('id').as('count'))
					.where('schedule_id', '=', schedule.id!)
					.executeTakeFirst(),
				db
					.selectFrom('schedule_preceptors')
					.select(db.fn.count('id').as('count'))
					.where('schedule_id', '=', schedule.id!)
					.executeTakeFirst(),
				db
					.selectFrom('schedule_clerkships')
					.select(db.fn.count('id').as('count'))
					.where('schedule_id', '=', schedule.id!)
					.executeTakeFirst()
			]);

			return {
				...schedule,
				studentCount: Number(students?.count || 0),
				preceptorCount: Number(preceptors?.count || 0),
				clerkshipCount: Number(clerkships?.count || 0)
			};
		})
	);

	return {
		schedules: schedulesWithCounts,
		activeScheduleId,
		userId
	};
};
