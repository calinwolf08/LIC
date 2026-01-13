/**
 * Calendar Page - Server Load
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getStudents } from '$lib/features/students/services/student-service';
import { getPreceptors } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkships } from '$lib/features/clerkships/services/clerkship-service';
import { getScheduleSummaryData } from '$lib/features/schedules/services/schedule-views-service';
import { getBlackoutDates } from '$lib/features/blackout-dates/services/blackout-date-service';

export const load: PageServerLoad = async ({ locals }) => {
	// Get the user's active schedule
	let activeSchedule: { id: string; startDate: string; endDate: string } | null = null;

	if (locals.session?.user?.id) {
		const user = await db
			.selectFrom('user')
			.select('active_schedule_id')
			.where('id', '=', locals.session.user.id)
			.executeTakeFirst();

		if (user?.active_schedule_id) {
			const schedule = await db
				.selectFrom('scheduling_periods')
				.select(['id', 'start_date', 'end_date'])
				.where('id', '=', user.active_schedule_id)
				.executeTakeFirst();

			if (schedule && schedule.id) {
				activeSchedule = {
					id: schedule.id,
					startDate: schedule.start_date,
					endDate: schedule.end_date
				};
			}
		}
	}

	// Load filter options, schedule summary, and blackout dates in parallel
	const [students, preceptors, clerkships, scheduleSummary, blackoutDates] = await Promise.all([
		getStudents(db),
		getPreceptors(db),
		getClerkships(db),
		getScheduleSummaryData(db),
		getBlackoutDates(db)
	]);

	return {
		students,
		preceptors,
		clerkships,
		scheduleSummary,
		blackoutDates,
		activeSchedule
	};
};
