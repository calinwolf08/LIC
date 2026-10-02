/**
 * Whole-schedule validation (Step 10).
 *
 * Runs the structured per-assignment checks over every assignment in a
 * schedule in a single batched pass (no N+1 queries) and indexes the results
 * by date, student, and preceptor for the calendar / dashboard.
 *
 * The work is split into two layers so the same rules can be applied to
 * hypothetical, not-yet-persisted assignments (the manual planner's "dry run"):
 *   - `loadValidationInputs` does all the DB reads and builds the context.
 *   - `evaluateAssignments` is a pure, in-memory pass over an assignment list.
 * `validateSchedule` is simply `evaluateAssignments(await loadValidationInputs(...))`.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import {
	validateCandidateWithContext,
	type ValidationContext,
	type Violation
} from './assignment-validation';
import { normalizeSession, sessionsOverlap } from './session-slots';
import { mutualExclusionKey } from './mutual-exclusion';
import { normalizeSchedulingKind, weekKey } from './scheduling-kind';

export interface ScheduleViolation extends Violation {
	assignment_id: string;
	/**
	 * Every assignment this finding covers. For per-assignment codes this is just
	 * `[assignment_id]`; for slot-scoped codes (preceptor_capacity) it is all the
	 * assignments sharing the over-subscribed preceptor-day.
	 */
	assignment_ids: string[];
	date: string;
	student_id: string;
	preceptor_id: string;
}

export interface ScheduleValidationResult {
	violations: ScheduleViolation[];
	byDate: Record<string, ScheduleViolation[]>;
	byStudent: Record<string, ScheduleViolation[]>;
	byPreceptor: Record<string, ScheduleViolation[]>;
	/** Count of violations by code, for summaries. */
	counts: Record<string, number>;
}

/**
 * The shape of an assignment the evaluator needs. Committed rows from
 * `schedule_assignments` satisfy it, and so do the planner's tentative pins (which
 * supply a synthetic `id`), so both run through exactly the same rules.
 */
export interface ValidationAssignment {
	id: string | null;
	student_id: string;
	preceptor_id: string | null;
	clerkship_id: string | null;
	site_id: string | null;
	date: string;
	credit_value: number;
	session: string;
	kind: string;
}

/**
 * Everything `evaluateAssignments` needs that comes from the database. Produced by
 * `loadValidationInputs`; the planner builds a variant that also covers the entities
 * its pins reference.
 */
export interface ValidationInputs {
	assignments: ValidationAssignment[];
	ctx: ValidationContext;
	/** `mutualExclusionKey(a, b)` for every mutually-exclusive preceptor pair in scope. */
	exclusionKeys: Set<string>;
	/** clerkship_id -> block | scattered for every clerkship in scope. */
	clerkshipKind: Map<string, 'block' | 'scattered'>;
}

function emptyInputs(start: string, end: string): ValidationInputs {
	return {
		assignments: [],
		ctx: {
			scheduleStart: start,
			scheduleEnd: end,
			preceptorMaxStudents: new Map(),
			preceptorUnavailable: new Map(),
			preceptorHealthSystem: new Map(),
			clerkshipSites: new Map(),
			studentOnboarded: new Map(),
			blackoutDates: new Set(),
			existingStudentIds: new Set(),
			existingPreceptorIds: new Set(),
			existingClerkshipIds: new Set(),
			preceptorInPinch: new Map(),
			preceptorPreferredDates: new Map(),
			preceptorDateOccupancy: new Map()
		},
		exclusionKeys: new Set(),
		clerkshipKind: new Map()
	};
}

/**
 * Load the committed assignments for a schedule's students plus all the context the
 * rules consult (availability, onboarding, capacity, blackouts, clerkship kinds,
 * mutual exclusions). No rules are applied here — see `evaluateAssignments`.
 */
export async function loadValidationInputs(
	db: Kysely<DB>,
	scheduleId: string
): Promise<ValidationInputs> {
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();
	const rangeStart = period?.start_date ?? '0000-01-01';
	const rangeEnd = period?.end_date ?? '9999-12-31';

	// Students & clerkships in this schedule
	const studentRows = await db
		.selectFrom('schedule_students')
		.select('student_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	const studentIds = studentRows.map((r) => r.student_id);

	if (studentIds.length === 0) {
		return emptyInputs(rangeStart, rangeEnd);
	}

	// All assignments for those students. Not schedule-scoped: a student is one
	// place per calendar day across every schedule (the DB enforces a global
	// UNIQUE(student_id, date)), so the whole-schedule health view considers all
	// of a student's days when flagging double-books and capacity.
	const assignments: ValidationAssignment[] = await db
		.selectFrom('schedule_assignments')
		.select([
			'id',
			'student_id',
			'preceptor_id',
			'clerkship_id',
			'site_id',
			'date',
			'credit_value',
			'session',
			'kind'
		])
		.where('student_id', 'in', studentIds)
		.execute();

	if (assignments.length === 0) {
		return emptyInputs(rangeStart, rangeEnd);
	}

	// Non-clinical days (free_day / exam) have no preceptor or clerkship, so they are
	// excluded from every preceptor/clerkship-keyed query and grouping below. They
	// still participate in the session-clash slot logic (a free day + a clinical day
	// on one date is a double-book).
	const preceptorIds = [
		...new Set(assignments.map((a) => a.preceptor_id).filter((p): p is string => p !== null))
	];
	const clerkshipIds = [
		...new Set(assignments.map((a) => a.clerkship_id).filter((c): c is string => c !== null))
	];

	// Batch-load the context inputs
	const [preceptors, clerkships, availability, blackouts, clerkshipSites, onboarding] =
		await Promise.all([
			preceptorIds.length
				? db
						.selectFrom('preceptors')
						.select(['id', 'max_students', 'health_system_id'])
						.where('id', 'in', preceptorIds)
						.execute()
				: Promise.resolve([]),
			clerkshipIds.length
				? db
						.selectFrom('clerkships')
						.select(['id', 'scheduling_kind'])
						.where('id', 'in', clerkshipIds)
						.execute()
				: Promise.resolve([]),
			preceptorIds.length
				? db
						.selectFrom('preceptor_availability')
						.select(['preceptor_id', 'date', 'is_available', 'preference'])
						.where('preceptor_id', 'in', preceptorIds)
						.execute()
				: Promise.resolve([]),
			db.selectFrom('blackout_dates').select('date').where('schedule_id', '=', scheduleId).execute(),
			clerkshipIds.length
				? db
						.selectFrom('clerkship_sites')
						.select(['clerkship_id', 'site_id'])
						.where('clerkship_id', 'in', clerkshipIds)
						.execute()
				: Promise.resolve([]),
			db
				.selectFrom('student_health_system_onboarding')
				.select(['student_id', 'health_system_id', 'is_completed'])
				.where('student_id', 'in', studentIds)
				.execute()
		]);

	// Build context maps
	const preceptorMaxStudents = new Map<string, number>();
	const preceptorHealthSystem = new Map<string, string | null>();
	for (const p of preceptors) {
		preceptorMaxStudents.set(p.id!, p.max_students);
		preceptorHealthSystem.set(p.id!, p.health_system_id);
	}

	const preceptorUnavailable = new Map<string, Set<string>>();
	// Preference-aware maps for the `preferred_day_available` health note (H8): the
	// "in a pinch" days a preceptor is on, and the "preferred" days (in range) they
	// still have open.
	const preceptorInPinch = new Map<string, Set<string>>();
	const preceptorPreferredDates = new Map<string, string[]>();
	for (const a of availability) {
		if (a.is_available === 0) {
			if (!preceptorUnavailable.has(a.preceptor_id))
				preceptorUnavailable.set(a.preceptor_id, new Set());
			preceptorUnavailable.get(a.preceptor_id)!.add(a.date);
			continue;
		}
		if (a.preference === 'in_a_pinch') {
			if (!preceptorInPinch.has(a.preceptor_id))
				preceptorInPinch.set(a.preceptor_id, new Set());
			preceptorInPinch.get(a.preceptor_id)!.add(a.date);
		} else if (a.preference === 'preferred' && a.date >= rangeStart && a.date <= rangeEnd) {
			if (!preceptorPreferredDates.has(a.preceptor_id))
				preceptorPreferredDates.set(a.preceptor_id, []);
			preceptorPreferredDates.get(a.preceptor_id)!.push(a.date);
		}
	}

	// Per-preceptor-day occupancy from committed assignments, so the health note only
	// counts a preferred day as an alternative when the preceptor is under capacity.
	const preceptorDateOccupancy = new Map<string, number>();
	for (const a of assignments) {
		const k = `${a.preceptor_id}:${a.date}`;
		preceptorDateOccupancy.set(k, (preceptorDateOccupancy.get(k) ?? 0) + 1);
	}

	const clerkshipSiteMap = new Map<string, Set<string>>();
	for (const cs of clerkshipSites) {
		if (!clerkshipSiteMap.has(cs.clerkship_id)) clerkshipSiteMap.set(cs.clerkship_id, new Set());
		clerkshipSiteMap.get(cs.clerkship_id)!.add(cs.site_id);
	}

	const studentOnboarded = new Map<string, Set<string>>();
	for (const o of onboarding) {
		if (o.is_completed === 1) {
			if (!studentOnboarded.has(o.student_id)) studentOnboarded.set(o.student_id, new Set());
			studentOnboarded.get(o.student_id)!.add(o.health_system_id);
		}
	}

	const ctx: ValidationContext = {
		scheduleStart: rangeStart,
		scheduleEnd: rangeEnd,
		preceptorMaxStudents,
		preceptorUnavailable,
		preceptorHealthSystem,
		clerkshipSites: clerkshipSiteMap,
		studentOnboarded,
		blackoutDates: new Set(blackouts.map((b) => b.date)),
		existingStudentIds: new Set(studentIds),
		existingPreceptorIds: new Set(preceptorIds),
		existingClerkshipIds: new Set(clerkships.map((c) => c.id!)),
		preceptorInPinch,
		preceptorPreferredDates,
		preceptorDateOccupancy
	};

	// Mutual-exclusion pairs among the preceptors in scope (L2).
	const exclusionRows = preceptorIds.length
		? await db
				.selectFrom('preceptor_mutual_exclusions')
				.select(['preceptor_a_id', 'preceptor_b_id'])
				.where('preceptor_a_id', 'in', preceptorIds)
				.where('preceptor_b_id', 'in', preceptorIds)
				.execute()
		: [];
	const exclusionKeys = new Set(
		exclusionRows.map((e) => mutualExclusionKey(e.preceptor_a_id, e.preceptor_b_id))
	);

	// Clerkship kinds (L3): block (inpatient) | scattered (outpatient).
	const clerkshipKind = new Map<string, 'block' | 'scattered'>();
	for (const c of clerkships) clerkshipKind.set(c.id!, normalizeSchedulingKind(c.scheduling_kind));

	return { assignments, ctx, exclusionKeys, clerkshipKind };
}

/**
 * Pure, in-memory application of every whole-schedule rule to an assignment list.
 * Takes no database — it only reads `inputs`, so the same rules run identically over
 * committed rows and over the planner's hypothetical pins.
 */
export function evaluateAssignments(inputs: ValidationInputs): ScheduleValidationResult {
	const { assignments, ctx, exclusionKeys, clerkshipKind } = inputs;

	if (assignments.length === 0) {
		return { violations: [], byDate: {}, byStudent: {}, byPreceptor: {}, counts: {} };
	}

	// Preceptor-date occupancy for capacity checks: keep the actual assignments on
	// each slot so a single capacity finding can reference them all.
	const slotAssignments = new Map<string, ValidationAssignment[]>();
	for (const a of assignments) {
		if (a.preceptor_id === null) continue; // non-clinical days have no preceptor slot
		const k = `${a.preceptor_id}:${a.date}`;
		(slotAssignments.get(k) ?? slotAssignments.set(k, []).get(k)!).push(a);
	}

	// student:date -> assignment id (double-booking is DB-prevented, but keep for completeness)
	const existingByStudentDate = new Map<string, string>();
	for (const a of assignments) {
		existingByStudentDate.set(`${a.student_id}:${a.date}`, a.id!);
	}

	const violations: ScheduleViolation[] = [];

	// Per-assignment findings (capacity is slot-scoped and handled separately below).
	for (const a of assignments) {
		// Non-clinical days (free_day / exam) have no preceptor/clerkship/site to
		// validate; their only whole-schedule concern is the session clash handled
		// by the slot logic below (M2/M3).
		if (a.kind !== 'clinical') continue;
		const res = validateCandidateWithContext(
			{
				student_id: a.student_id,
				preceptor_id: a.preceptor_id ?? '',
				clerkship_id: a.clerkship_id,
				site_id: a.site_id,
				date: a.date,
				excludeId: a.id! // exclude self from double-booking
			},
			ctx,
			existingByStudentDate
		);

		for (const v of [...res.hard, ...res.soft]) {
			violations.push({
				...v,
				assignment_id: a.id!,
				assignment_ids: [a.id!],
				date: a.date,
				student_id: a.student_id,
				preceptor_id: a.preceptor_id ?? ''
			});
		}
	}

	// Session clash (L1): ONE finding per (student, date) whose assignments occupy an
	// overlapping session — two mornings, two afternoons, or a full day overlapping
	// anything. A morning + afternoon pair (AM + PM) is fine, and credit per day is
	// NOT capped. Slot-scoped like capacity so the count is per day.
	const studentDaySlots = new Map<string, ValidationAssignment[]>();
	for (const a of assignments) {
		const k = `${a.student_id}:${a.date}`;
		(studentDaySlots.get(k) ?? studentDaySlots.set(k, []).get(k)!).push(a);
	}
	for (const [, slot] of studentDaySlots) {
		if (slot.length < 2) continue;
		const sessions = slot.map((a) => normalizeSession(a.session));
		const clashes = sessions.some((s, i) => sessions.some((t, j) => i !== j && sessionsOverlap(s, t)));
		if (clashes) {
			const first = slot[0];
			violations.push({
				code: 'session_clash',
				message: `Student has overlapping sessions on ${first.date}`,
				entity_refs: { student_id: first.student_id },
				assignment_id: first.id!,
				assignment_ids: slot.map((a) => a.id!),
				date: first.date,
				student_id: first.student_id,
				preceptor_id: first.preceptor_id ?? ''
			});
		}
	}

	// Mutual exclusion (L2): ONE finding per (student, date) where two of the day's
	// preceptors are marked not to share a student-day. Slot-scoped like the others.
	if (exclusionKeys.size > 0) {
		for (const [, slot] of studentDaySlots) {
			if (slot.length < 2) continue;
			let hit: ValidationAssignment | undefined;
			outer: for (let i = 0; i < slot.length; i++) {
				for (let j = i + 1; j < slot.length; j++) {
					const pi = slot[i].preceptor_id;
					const pj = slot[j].preceptor_id;
					if (!pi || !pj) continue; // non-clinical days have no preceptor
					if (exclusionKeys.has(mutualExclusionKey(pi, pj))) {
						hit = slot[i];
						break outer;
					}
				}
			}
			if (hit) {
				violations.push({
					code: 'mutual_exclusion',
					message: `Student has two preceptors marked not to share a day on ${hit.date}`,
					entity_refs: { student_id: hit.student_id },
					assignment_id: hit.id!,
					assignment_ids: slot.map((a) => a.id!),
					date: hit.date,
					student_id: hit.student_id,
					preceptor_id: hit.preceptor_id ?? ''
				});
			}
		}
	}

	// Block-week conflict (L3): block (inpatient) clerkships occupy whole weeks, so
	// a scattered (outpatient) day can't share a week a block already consumes. For
	// each student, derive the weeks consumed by block assignments, then flag every
	// scattered day (including standalone-elective days, which have no clerkship)
	// that lands in one — one finding per offending day so it can be moved.
	const kindOf = (clerkshipId: string | null): 'block' | 'scattered' =>
		clerkshipId ? (clerkshipKind.get(clerkshipId) ?? 'scattered') : 'scattered';

	const assignmentsByStudent = new Map<string, ValidationAssignment[]>();
	for (const a of assignments) {
		(assignmentsByStudent.get(a.student_id) ?? assignmentsByStudent.set(a.student_id, []).get(a.student_id)!).push(a);
	}
	for (const [, studentAssignments] of assignmentsByStudent) {
		const blockWeeks = new Set<string>();
		for (const a of studentAssignments) {
			if (kindOf(a.clerkship_id) === 'block') blockWeeks.add(weekKey(a.date));
		}
		if (blockWeeks.size === 0) continue;
		for (const a of studentAssignments) {
			// A non-clinical day (free_day / exam) is not an outpatient clerkship day, so
			// it never conflicts with a block week (M2/M3).
			if (a.kind !== 'clinical') continue;
			if (kindOf(a.clerkship_id) === 'block') continue;
			if (!blockWeeks.has(weekKey(a.date))) continue;
			violations.push({
				code: 'block_week_conflict',
				message: `Outpatient day on ${a.date} falls in a week used by an inpatient block`,
				entity_refs: { student_id: a.student_id },
				assignment_id: a.id!,
				assignment_ids: [a.id!],
				date: a.date,
				student_id: a.student_id,
				preceptor_id: a.preceptor_id ?? ''
			});
		}
	}

	// Capacity: ONE finding per over-subscribed (preceptor, date), not one per
	// assignment — so four double-booked days read as 4, not 8.
	for (const [, slot] of slotAssignments) {
		const first = slot[0];
		const firstPreceptor = first.preceptor_id ?? '';
		const max = ctx.preceptorMaxStudents.get(firstPreceptor) ?? 1;
		if (slot.length > max) {
			violations.push({
				code: 'preceptor_capacity',
				message: 'Preceptor is over capacity for this date',
				entity_refs: { preceptor_id: firstPreceptor },
				assignment_id: first.id!,
				assignment_ids: slot.map((a) => a.id!),
				date: first.date,
				student_id: first.student_id,
				preceptor_id: firstPreceptor
			});
		}
	}

	const byDate: Record<string, ScheduleViolation[]> = {};
	const byStudent: Record<string, ScheduleViolation[]> = {};
	const byPreceptor: Record<string, ScheduleViolation[]> = {};
	const counts: Record<string, number> = {};
	for (const v of violations) {
		(byDate[v.date] ??= []).push(v);
		(byStudent[v.student_id] ??= []).push(v);
		(byPreceptor[v.preceptor_id] ??= []).push(v);
		counts[v.code] = (counts[v.code] ?? 0) + 1;
	}

	return { violations, byDate, byStudent, byPreceptor, counts };
}

export async function validateSchedule(
	db: Kysely<DB>,
	scheduleId: string
): Promise<ScheduleValidationResult> {
	return evaluateAssignments(await loadValidationInputs(db, scheduleId));
}
