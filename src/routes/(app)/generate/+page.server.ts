import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getSetupChecklist } from '$lib/features/scheduling/services/readiness';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	const scheduleId = userId ? await getActiveScheduleId(userId) : null;

	let activeSchedule: { startDate: string; endDate: string; name: string } | null = null;
	let checklist: Awaited<ReturnType<typeof getSetupChecklist>> = [];

	if (scheduleId) {
		const schedule = await db
			.selectFrom('scheduling_periods')
			.select(['name', 'start_date', 'end_date'])
			.where('id', '=', scheduleId)
			.executeTakeFirst();
		if (schedule) {
			activeSchedule = {
				name: schedule.name,
				startDate: schedule.start_date,
				endDate: schedule.end_date
			};
		}
		checklist = await getSetupChecklist(db, scheduleId, true);
	}

	return { activeSchedule, checklist };
};
