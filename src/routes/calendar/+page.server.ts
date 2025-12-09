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

export const load: PageServerLoad = async () => {
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
		blackoutDates
	};
};
