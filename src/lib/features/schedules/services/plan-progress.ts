/**
 * Manual planner — requirement progress per student and clerkship (planner feedback).
 *
 * For each student in the schedule and each clerkship: the days required, the days
 * already assigned (saved, counted exactly as the requirement status everywhere else
 * counts them: credit, so a half day is 0.5), the days planned in the caller's draft,
 * and what's left (or how far over). Drives the planner's summary table and the
 * "N more needed" hint on the add form.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { getStudentStatuses } from '$lib/features/scheduling/services/requirement-status';
import { listPins } from './plan-service';

export interface PlanProgressRow {
	studentId: string;
	studentName: string;
	clerkshipId: string;
	clerkshipName: string;
	required: number;
	/** Saved days (completed + scheduled), in credit. */
	assigned: number;
	/** Days in the caller's draft, in credit. */
	planned: number;
	/** Still needed after saved + planned (0 when met). */
	remaining: number;
	/** Beyond the requirement after saved + planned (0 when not over). */
	over: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getPlanProgress(
	db: Kysely<DB>,
	scheduleId: string,
	userId: string,
	today?: string
): Promise<PlanProgressRow[]> {
	const [statuses, pins] = await Promise.all([
		getStudentStatuses(db, scheduleId, today),
		listPins(db, scheduleId, userId)
	]);

	const planned = new Map<string, number>();
	for (const pin of pins) {
		if (pin.kind !== 'clinical' || !pin.clerkship_id) continue;
		const key = `${pin.student_id}|${pin.clerkship_id}`;
		planned.set(key, (planned.get(key) ?? 0) + (pin.credit_value ?? 1));
	}

	return statuses.flatMap((s) =>
		s.per_clerkship.map((c) => {
			const assigned = round2(c.completed + c.scheduled);
			const inDraft = round2(planned.get(`${s.student_id}|${c.clerkship_id}`) ?? 0);
			const total = assigned + inDraft;
			return {
				studentId: s.student_id,
				studentName: s.student_name,
				clerkshipId: c.clerkship_id,
				clerkshipName: c.clerkship_name,
				required: c.required,
				assigned,
				planned: inDraft,
				remaining: round2(Math.max(0, c.required - total)),
				over: round2(Math.max(0, total - c.required))
			};
		})
	);
}
