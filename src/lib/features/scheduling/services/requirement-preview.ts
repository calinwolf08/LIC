/**
 * Requirement impact preview (Step 17).
 *
 * Powers the dialog's live strip — "Assigning 3 days · 2 of 3 remaining for
 * Pediatrics" — and the amber over-assignment warning.
 *
 * Counting follows `requirement-status.ts`: days already past count as
 * *completed*, days from today on count as *scheduled*.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export interface RequirementImpact {
	clerkshipId: string;
	clerkshipName: string;
	/** Set when the preview targets a specific elective's minimum_days (P-01). */
	electiveId?: string;
	electiveName?: string;
	required: number;
	completed: number;
	scheduled: number;
	/** Days still needed before this selection (floored at 0). */
	unscheduled: number;
	/** How many days the user is about to assign. */
	selected: number;
	/** completed + scheduled + selected */
	resultingTotal: number;
	/** How far past `required` the resulting total lands (0 when it fits). */
	exceedsBy: number;
}

function todayUTC(): string {
	return new Date().toISOString().split('T')[0];
}

/**
 * Project the effect of assigning `dateCount` more days of `clerkshipId` to
 * `studentId`.
 *
 * @param today - injectable for tests; defaults to today (UTC).
 */
export async function previewRequirementImpact(
	db: Kysely<DB>,
	scheduleId: string,
	studentId: string,
	clerkshipId: string,
	dateCount: number,
	today: string = todayUTC(),
	excludeId?: string | null,
	electiveId?: string | null
): Promise<RequirementImpact> {
	const clerkship = await db
		.selectFrom('clerkships')
		.innerJoin('schedule_clerkships', 'schedule_clerkships.clerkship_id', 'clerkships.id')
		.select(['clerkships.name as name', 'clerkships.required_days as required_days'])
		.where('clerkships.id', '=', clerkshipId)
		.where('schedule_clerkships.schedule_id', '=', scheduleId)
		.executeTakeFirst();

	// When targeting an elective, the requirement is that elective's minimum_days
	// and only its own days count (P-01); otherwise the clerkship's required_days.
	const elective = electiveId
		? await db
				.selectFrom('clerkship_electives')
				.select(['name', 'minimum_days'])
				.where('id', '=', electiveId)
				.where('clerkship_id', '=', clerkshipId)
				.executeTakeFirst()
		: undefined;

	const required = elective ? elective.minimum_days : (clerkship?.required_days ?? 0);

	let assignmentQuery = db
		.selectFrom('schedule_assignments')
		.select('date')
		// Scope to THIS schedule — like the clerkship lookup above. A student can
		// belong to more than one schedule with overlapping dates, and counting
		// their other schedules' days here would misreport the requirement
		// (e2e finding P3-c, sibling of P3-a).
		.where('schedule_id', '=', scheduleId)
		.where('student_id', '=', studentId)
		.where('clerkship_id', '=', clerkshipId);
	if (electiveId) assignmentQuery = assignmentQuery.where('elective_id', '=', electiveId);
	// Edit mode: the edited assignment's existing day is re-counted as part of
	// `selected`, so exclude it here to avoid double-counting against `required`.
	if (excludeId) assignmentQuery = assignmentQuery.where('id', '!=', excludeId);
	const assignments = await assignmentQuery.execute();

	const completed = assignments.filter((a) => a.date < today).length;
	const scheduled = assignments.length - completed;
	const selected = Math.max(0, dateCount);
	const resultingTotal = completed + scheduled + selected;

	return {
		clerkshipId,
		clerkshipName: clerkship?.name ?? '',
		electiveId: elective ? (electiveId ?? undefined) : undefined,
		electiveName: elective?.name,
		required,
		completed,
		scheduled,
		unscheduled: Math.max(0, required - completed - scheduled),
		selected,
		resultingTotal,
		exceedsBy: Math.max(0, resultingTotal - required)
	};
}
