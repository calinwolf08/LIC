/**
 * Dashboard Page - Server Load
 *
 * Uses the status / validation / readiness services so the dashboard answers
 * "what should I do next?" — setup checklist, schedule health, and student
 * status — without any auto-generation.
 */

import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import {
	getStudentStatuses,
	completionPercent
} from '$lib/features/scheduling/services/requirement-status';
import { validateSchedule } from '$lib/features/scheduling/services/schedule-validation';
import { getSetupChecklist } from '$lib/features/scheduling/services/readiness';
import { hasAutogen } from '$lib/server/entitlements';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	const scheduleId = userId ? await getActiveScheduleId(userId) : null;

	let activeSchedule: { id: string; name: string; start_date: string; end_date: string } | null =
		null;
	if (scheduleId) {
		const schedule = await db
			.selectFrom('scheduling_periods')
			.select(['id', 'name', 'start_date', 'end_date'])
			.where('id', '=', scheduleId)
			.executeTakeFirst();
		if (schedule?.id) {
			activeSchedule = {
				id: schedule.id,
				name: schedule.name,
				start_date: schedule.start_date,
				end_date: schedule.end_date
			};
		}
	}

	// Totals must be scoped to the active schedule through the junction tables —
	// a bare count leaks every tenant's entity counts. Assignments have no
	// schedule_id, so they scope through schedule_students.
	const countScoped = async (junction: 'schedule_students' | 'schedule_preceptors' | 'schedule_clerkships') => {
		if (!scheduleId) return { c: 0 };
		return db
			.selectFrom(junction)
			.select((eb) => eb.fn.countAll<number>().as('c'))
			.where('schedule_id', '=', scheduleId)
			.executeTakeFirst();
	};

	const [studentCount, preceptorCount, clerkshipCount, assignmentCount] = await Promise.all([
		countScoped('schedule_students'),
		countScoped('schedule_preceptors'),
		countScoped('schedule_clerkships'),
		scheduleId
			? db
					.selectFrom('schedule_assignments as sa')
					.innerJoin('schedule_students as ss', (join) =>
						join
							.onRef('ss.student_id', '=', 'sa.student_id')
							.on('ss.schedule_id', '=', scheduleId)
					)
					.select((eb) => eb.fn.countAll<number>().as('c'))
					.executeTakeFirst()
			: Promise.resolve({ c: 0 })
	]);

	const statusSummary = { full: 0, partial: 0, none: 0 };
	let atRisk: Array<{ id: string; name: string; unscheduled: number; percent: number }> = [];
	let violationCount = 0;
	let violationsByCode: Record<string, number> = {};
	let checklist: Awaited<ReturnType<typeof getSetupChecklist>> = [];

	if (scheduleId) {
		const [statuses, validation, checklistItems] = await Promise.all([
			getStudentStatuses(db, scheduleId),
			validateSchedule(db, scheduleId),
			getSetupChecklist(db, scheduleId, hasAutogen(locals))
		]);

		for (const s of statuses) statusSummary[s.scheduling_state]++;
		atRisk = statuses
			.filter((s) => s.overall.unscheduled > 0)
			.sort((a, b) => b.overall.unscheduled - a.overall.unscheduled)
			.slice(0, 5)
			.map((s) => ({
				id: s.student_id,
				name: s.student_name,
				unscheduled: s.overall.unscheduled,
				percent: completionPercent(s.overall)
			}));

		violationCount = validation.violations.length;
		violationsByCode = validation.counts;
		checklist = checklistItems;
	}

	return {
		activeSchedule,
		stats: {
			total_students: Number(studentCount?.c ?? 0),
			total_preceptors: Number(preceptorCount?.c ?? 0),
			total_clerkships: Number(clerkshipCount?.c ?? 0),
			total_assignments: Number(assignmentCount?.c ?? 0),
			fully_scheduled_students: statusSummary.full,
			partially_scheduled_students: statusSummary.partial,
			unscheduled_students: statusSummary.none
		},
		atRisk,
		violationCount,
		violationsByCode,
		checklist
	};
};
