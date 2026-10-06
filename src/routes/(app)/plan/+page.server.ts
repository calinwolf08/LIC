/**
 * Manual Planner — server load (L4 #3).
 *
 * The planner stages tentative "pins" (draft assignments) against the active
 * schedule, shows the conflicts they would produce, and commits them in one action.
 * This loads the active schedule and its scoped entity lists; the pins and their
 * conflicts are fetched client-side from /api/schedules/plan/*.
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getStudentsBySchedule } from '$lib/features/students/services/student-service';
import { getPreceptorsBySchedule } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkshipsBySchedule } from '$lib/features/clerkships/services/clerkship-service';
import { siteService } from '$lib/features/sites/services/site-service';

export const load: PageServerLoad = async ({ locals }) => {
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
			if (schedule?.id) {
				activeSchedule = {
					id: schedule.id,
					startDate: schedule.start_date,
					endDate: schedule.end_date
				};
			}
		}
	}

	const scheduleId = activeSchedule?.id ?? null;
	const [students, preceptors, clerkships, sites] = await Promise.all([
		scheduleId ? getStudentsBySchedule(db, scheduleId) : Promise.resolve([]),
		scheduleId ? getPreceptorsBySchedule(db, scheduleId) : Promise.resolve([]),
		scheduleId ? getClerkshipsBySchedule(db, scheduleId) : Promise.resolve([]),
		scheduleId ? siteService.getSitesBySchedule(scheduleId) : Promise.resolve([])
	]);

	return {
		activeSchedule,
		hasActiveSchedule: activeSchedule !== null,
		students: students.map((s) => ({ id: s.id as string, name: s.name })),
		preceptors: preceptors.map((p) => ({ id: p.id as string, name: p.name })),
		clerkships: clerkships.map((c) => ({ id: c.id as string, name: c.name })),
		sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
	};
};
