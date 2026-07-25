/**
 * Submit-payload construction for the unified assignment dialog (Step 18).
 *
 * Kept free of Svelte and `fetch` so the "which days are flagged, which
 * categories need a conversation, what exactly gets POSTed" logic is unit
 * testable on its own.
 */

import type { OverrideSideEffect } from './assignment-service';
import type { DayState } from '$lib/features/scheduling/services/assignment-day-state';

/** Soft categories the dialog can raise a conversation about. */
export type OverrideCategory =
	| 'preceptor_unavailable'
	| 'preceptor_capacity'
	| 'blackout_date'
	| 'not_onboarded'
	| 'over_required_days'
	| 'past_date';

export interface DayOccupant {
	assignmentId: string;
	studentId: string;
	studentName: string;
}

/** One flagged category across the current selection. */
export interface FlaggedCategory {
	category: OverrideCategory;
	/** Selected dates this category applies to. Empty for selection-wide categories. */
	dates: string[];
	/** For `preceptor_capacity`: who already holds those days. */
	occupants: DayOccupant[];
}

/** Codes that apply to the whole selection rather than to specific days. */
export interface SelectionWideFlags {
	/** The selection takes the student past the clerkship's required days. */
	overRequired?: boolean;
	/** The student has not completed onboarding at the preceptor's health system. */
	notOnboarded?: boolean;
}

export interface FlagAnalysis {
	/** Days that can never be assigned — the student is already booked. */
	blockedDates: string[];
	/** Days that will actually be submitted. */
	submittableDates: string[];
	/** Categories that need an explicit decision, in conversation order. */
	categories: FlaggedCategory[];
}

const CATEGORY_ORDER: OverrideCategory[] = [
	'preceptor_unavailable',
	'preceptor_capacity',
	'blackout_date',
	'not_onboarded',
	'over_required_days',
	'past_date'
];

/**
 * Work out which of the selected days are hard-blocked, and which soft
 * categories the user must decide on before the assignment can be created.
 */
export function analyseSelection(
	selectedDates: string[],
	dayStates: DayState[],
	selectionWide: SelectionWideFlags = {}
): FlagAnalysis {
	const byDate = new Map(dayStates.map((d) => [d.date, d]));
	const blockedDates: string[] = [];
	const submittableDates: string[] = [];
	const buckets = new Map<OverrideCategory, FlaggedCategory>();

	const bucket = (category: OverrideCategory): FlaggedCategory => {
		let existing = buckets.get(category);
		if (!existing) {
			existing = { category, dates: [], occupants: [] };
			buckets.set(category, existing);
		}
		return existing;
	};

	for (const date of [...selectedDates].sort()) {
		const day = byDate.get(date);
		if (day?.studentBusy) {
			blockedDates.push(date);
			continue;
		}
		submittableDates.push(date);
		if (!day) continue;

		if (day.state === 'unavailable') bucket('preceptor_unavailable').dates.push(date);
		if (day.state === 'blackout') bucket('blackout_date').dates.push(date);
		if (day.isPast) bucket('past_date').dates.push(date);
		if (day.preceptorAtCapacity) {
			const b = bucket('preceptor_capacity');
			b.dates.push(date);
			for (const occupant of day.preceptorBookings) {
				if (!b.occupants.some((o) => o.assignmentId === occupant.assignmentId)) {
					b.occupants.push(occupant);
				}
			}
		}
	}

	// Selection-wide categories only matter if something is actually submittable.
	if (submittableDates.length > 0) {
		if (selectionWide.notOnboarded) bucket('not_onboarded');
		if (selectionWide.overRequired) bucket('over_required_days');
	}

	const categories = CATEGORY_ORDER.filter((c) => buckets.has(c)).map((c) => buckets.get(c)!);
	return { blockedDates, submittableDates, categories };
}

export interface AssignmentSelectionInput {
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	siteId?: string | null;
	locked?: boolean;
	note?: string;
}

export interface SubmitPayload {
	student_id: string;
	preceptor_id: string;
	clerkship_id: string;
	site_id: string | null;
	dates: string[];
	locked: boolean;
	override_codes: OverrideCategory[];
	override_note?: string;
	side_effects?: OverrideSideEffect[];
}

/**
 * Build the POST body. Only categories the user accepted become
 * `override_codes`; only side effects they chose are included.
 */
export function buildSubmitPayload(
	selection: AssignmentSelectionInput,
	analysis: FlagAnalysis,
	accepted: OverrideCategory[],
	sideEffects: OverrideSideEffect[] = []
): SubmitPayload {
	const flagged = new Set(analysis.categories.map((c) => c.category));
	const codes = [...new Set(accepted)].filter((c) => flagged.has(c));

	return {
		student_id: selection.studentId,
		preceptor_id: selection.preceptorId,
		clerkship_id: selection.clerkshipId,
		site_id: selection.siteId || null,
		dates: analysis.submittableDates,
		locked: !!selection.locked,
		override_codes: codes,
		...(codes.length > 0 && selection.note ? { override_note: selection.note } : {}),
		...(sideEffects.length > 0 ? { side_effects: sideEffects } : {})
	};
}

/** Human copy for each override conversation. */
export const CATEGORY_COPY: Record<OverrideCategory, { title: string; describe: string }> = {
	preceptor_unavailable: {
		title: 'Preceptor is not available',
		describe: 'The preceptor is marked unavailable on these days.'
	},
	preceptor_capacity: {
		title: 'Preceptor already has a student',
		describe: 'The preceptor is at their student limit on these days.'
	},
	blackout_date: {
		title: 'Blackout date',
		describe: 'These days are blocked out for everyone.'
	},
	not_onboarded: {
		title: 'Student is not onboarded',
		describe: "The student has not completed onboarding at this preceptor's health system."
	},
	over_required_days: {
		title: 'More days than required',
		describe: 'This selection goes past the days the clerkship requires.'
	},
	past_date: {
		title: 'Date has already passed',
		describe: 'These days are in the past.'
	}
};
