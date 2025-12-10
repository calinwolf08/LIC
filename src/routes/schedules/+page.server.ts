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

	// Get all schedules accessible to the user
	// For now, show all schedules (will filter by user_id once auth is required)
	let query = db.selectFrom('scheduling_periods').selectAll();

	if (userId) {
		// Show schedules owned by user or orphaned schedules
		query = query.where((eb) =>
			eb.or([eb('user_id', '=', userId), eb('user_id', 'is', null)])
		);
	}

	const schedules = await query.orderBy('start_date', 'desc').execute();

	// Get user's active schedule ID
	let activeScheduleId: string | null = null;
	if (userId) {
		const user = await db
			.selectFrom('user')
			.select('active_schedule_id')
			.where('id', '=', userId)
			.executeTakeFirst();
		activeScheduleId = user?.active_schedule_id || null;
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
