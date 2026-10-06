/**
 * Structured assignment validation (shared by manual creation in Step 09 and
 * whole-schedule validation in Step 10).
 *
 * Distinguishes HARD violations (never allowed — a student cannot be in two
 * places at once) from SOFT violations (allowed with an explicit override;
 * always surfaced to the user).
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { CapacityChecker } from '../capacity/capacity-checker';
import { normalizeSession, sessionsOverlap, type SessionSlot } from './session-slots';
import { normalizeSchedulingKind, weekKey } from './scheduling-kind';

export type ViolationCode =
	/**
	 * Legacy hard code: a student in two places on one day. Kept for the
	 * auto-generation engine (which still places one full-day assignment per
	 * student-day) and back-compat; the manual + whole-schedule validators no
	 * longer emit it. Same-day capacity is now the credit-aware `day_overbooked`
	 * soft code below (client feedback L1 — half-days / AM-PM).
	 */
	| 'student_double_booked'
	/**
	 * A student's assignments on one day occupy the same session — two mornings,
	 * two afternoons, or a full day overlapping anything. Soft: allowed with an
	 * override, so a morning + afternoon pair (AM + PM) passes cleanly while a real
	 * time clash is flagged. Credit per day is NOT capped (L1 follow-up).
	 */
	| 'session_clash'
	/**
	 * The student is assigned to two preceptors on the same day that are marked
	 * mutually exclusive (L2). Soft: allowed with an override; the paid auto-gen
	 * tier avoids the pairing.
	 */
	| 'mutual_exclusion'
	/**
	 * A scattered (outpatient) day lands in a week already consumed by a block
	 * (inpatient) clerkship for the same student — or a block is added to a week
	 * that already holds scattered days (L3). Blocks occupy whole weeks, so the two
	 * can't share one. Soft: allowed with an override; the gated auto-placer avoids
	 * consumed weeks.
	 */
	| 'block_week_conflict'
	| 'preceptor_unavailable'
	| 'blackout_date'
	| 'preceptor_capacity'
	| 'site_not_allowed'
	| 'outside_schedule'
	| 'not_onboarded'
	/** The preceptor is not one of the student's core preceptors. */
	| 'outside_core_preceptor'
	/**
	 * The day sits on an "in a pinch" availability while the preceptor has an open
	 * "preferred" day the student could take instead (client feedback H8).
	 */
	| 'preferred_day_available'
	| 'entity_missing'
	/** Assigning this day takes the student past the clerkship's required days. */
	| 'over_required_days'
	/** The date has already happened. */
	| 'past_date';

export interface Violation {
	code: ViolationCode;
	message: string;
	/** Related entity ids for UI linking/aggregation. */
	entity_refs?: Record<string, string>;
}

export interface AssignmentCandidate {
	student_id: string;
	preceptor_id: string;
	/** Null for a standalone-elective day, which has no parent clerkship (E3). */
	clerkship_id: string | null;
	site_id?: string | null;
	date: string;
	/**
	 * The elective this day satisfies, if any. Elective days are tracked against
	 * the elective's own minimum, separately from the clerkship's core required
	 * days (mirrors the credit split in the generation path), so a day carrying an
	 * `elective_id` never counts toward — nor trips — the clerkship's
	 * `over_required_days` budget.
	 */
	elective_id?: string | null;
	/**
	 * Days of requirement credit this assignment is worth (M1). Uncapped; defaults
	 * from the availability slot's session but is overridable per assignment.
	 */
	credit_value?: number;
	/**
	 * Which part of the day this assignment occupies (L1). Two assignments clash
	 * only when their sessions overlap; AM + PM never clash.
	 */
	session?: SessionSlot;
	/**
	 * The kind of day (M2/M3). A non-clinical day (`free_day` / `exam`) has no
	 * preceptor/clerkship/site, so it skips every clinical check; it still occupies
	 * the day, so a session clash with another assignment is flagged. Defaults to
	 * 'clinical'.
	 */
	kind?: 'clinical' | 'free_day' | 'exam';
	/** Existing assignment id to exclude from conflict checks (edits). */
	excludeId?: string;
}

/** Clamp a credit value to a sane positive number, defaulting to a full day. */
export function candidateCredit(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Codes a user may knowingly accept. Persisted on the assignment as
 * `override_codes` so the schedule-health panel can list them for review.
 */
export const OVERRIDABLE_CODES = [
	'session_clash',
	'mutual_exclusion',
	'block_week_conflict',
	'preceptor_unavailable',
	'preceptor_capacity',
	'blackout_date',
	'not_onboarded',
	'over_required_days',
	'past_date',
	'site_not_allowed',
	'outside_schedule',
	'outside_core_preceptor',
	'preferred_day_available'
] as const satisfies readonly ViolationCode[];

export type OverrideCode = (typeof OVERRIDABLE_CODES)[number];

const OVERRIDABLE_SET: ReadonlySet<string> = new Set(OVERRIDABLE_CODES);

export function isOverrideCode(code: string): code is OverrideCode {
	return OVERRIDABLE_SET.has(code);
}

/** Human labels for override codes, for the review list and confirm copy. */
export const OVERRIDE_LABELS: Record<OverrideCode, string> = {
	session_clash: 'Another assignment in the same session',
	mutual_exclusion: 'Preceptors marked not to share a student-day',
	block_week_conflict: 'Week already used by an inpatient block',
	preceptor_unavailable: 'Preceptor not available',
	preceptor_capacity: 'Preceptor over capacity',
	blackout_date: 'Blackout date',
	not_onboarded: 'Student not onboarded',
	over_required_days: 'More days than required',
	past_date: 'Date already passed',
	site_not_allowed: 'Site not approved for clerkship',
	outside_schedule: 'Outside the schedule range',
	outside_core_preceptor: 'Not the student’s core preceptor',
	preferred_day_available: 'A preferred day was available'
};

export interface CandidateValidation {
	valid: boolean;
	hard: Violation[];
	soft: Violation[];
}

/**
 * The only hard block is a missing entity. Same-day capacity used to be hard
 * (`student_double_booked`); it is now the overridable `session_clash` soft code,
 * and credit per day is uncapped, so half-days (AM + PM) are possible (L1).
 */
export const HARD_CODES: ReadonlySet<ViolationCode> = new Set(['entity_missing']);

/**
 * Batched inputs so whole-schedule validation (Step 10) can validate many
 * assignments without N+1 queries. All maps are keyed by id/date as noted.
 */
export interface ValidationContext {
	scheduleStart: string;
	scheduleEnd: string;
	preceptorMaxStudents: Map<string, number>;
	/** preceptorId -> set of dates the preceptor is explicitly unavailable. */
	preceptorUnavailable: Map<string, Set<string>>;
	/** preceptorId -> healthSystemId (for onboarding checks), if known. */
	preceptorHealthSystem: Map<string, string | null>;
	/** clerkshipId -> set of allowed site ids (empty set = no restriction). */
	clerkshipSites: Map<string, Set<string>>;
	/** studentId -> set of health system ids the student has completed onboarding for. */
	studentOnboarded: Map<string, Set<string>>;
	blackoutDates: Set<string>;
	existingStudentIds: Set<string>;
	existingPreceptorIds: Set<string>;
	existingClerkshipIds: Set<string>;
	/**
	 * preceptorId -> set of dates the preceptor is available on with an "in a pinch"
	 * preference. Optional: when omitted, the `preferred_day_available` check is
	 * skipped (H8).
	 */
	preceptorInPinch?: Map<string, Set<string>>;
	/** preceptorId -> dates the preceptor is available on with a "preferred" preference (in range). */
	preceptorPreferredDates?: Map<string, string[]>;
	/** "preceptorId:date" -> number of assignments already on that preceptor-day, for open-slot checks. */
	preceptorDateOccupancy?: Map<string, number>;
}

/**
 * Validate a single candidate against a pre-built context. Pure and synchronous
 * so it can run in a tight loop over an entire schedule.
 *
 * @param existingByStudentDate - map "studentId:date" -> assignmentId, of
 *        assignments already in the schedule, for double-booking detection.
 */
export function validateCandidateWithContext(
	candidate: AssignmentCandidate,
	ctx: ValidationContext,
	existingByStudentDate: Map<string, string>
): CandidateValidation {
	const hard: Violation[] = [];
	const soft: Violation[] = [];

	// Entity existence (hard)
	if (!ctx.existingStudentIds.has(candidate.student_id))
		hard.push({ code: 'entity_missing', message: 'Student not found' });
	if (!ctx.existingPreceptorIds.has(candidate.preceptor_id))
		hard.push({ code: 'entity_missing', message: 'Preceptor not found' });
	// A standalone-elective day has no clerkship (E3); only a day that claims one
	// must have it exist.
	if (candidate.clerkship_id && !ctx.existingClerkshipIds.has(candidate.clerkship_id))
		hard.push({ code: 'entity_missing', message: 'Clerkship not found' });
	if (hard.length > 0) return { valid: false, hard, soft };

	// Same-day capacity is no longer checked here: it is credit-aware and
	// slot-scoped, so whole-schedule validation computes one `day_overbooked`
	// finding per over-booked student-day (see schedule-validation). Half-days
	// (0.5 + 0.5) must not trip a per-assignment check. `existingByStudentDate` is
	// still used below for the preferred-day availability check.

	// Outside schedule range (soft)
	if (candidate.date < ctx.scheduleStart || candidate.date > ctx.scheduleEnd) {
		soft.push({
			code: 'outside_schedule',
			message: `${candidate.date} is outside the schedule's date range`
		});
	}

	// Blackout date (soft)
	if (ctx.blackoutDates.has(candidate.date)) {
		soft.push({ code: 'blackout_date', message: `${candidate.date} is a blackout date` });
	}

	// Preceptor unavailable (soft)
	if (ctx.preceptorUnavailable.get(candidate.preceptor_id)?.has(candidate.date)) {
		soft.push({
			code: 'preceptor_unavailable',
			message: `Preceptor is not available on ${candidate.date}`,
			entity_refs: { preceptor_id: candidate.preceptor_id }
		});
	}

	// Site not allowed for clerkship (soft). A standalone-elective day has no
	// clerkship allowlist, so the site check doesn't apply.
	if (candidate.site_id && candidate.clerkship_id) {
		const allowed = ctx.clerkshipSites.get(candidate.clerkship_id);
		if (allowed && allowed.size > 0 && !allowed.has(candidate.site_id)) {
			soft.push({
				code: 'site_not_allowed',
				message: 'This site is not among the allowed sites for the clerkship',
				entity_refs: { clerkship_id: candidate.clerkship_id, site_id: candidate.site_id }
			});
		}
	}

	// Student not onboarded to the preceptor's health system (soft)
	const hs = ctx.preceptorHealthSystem.get(candidate.preceptor_id);
	if (hs) {
		const onboarded = ctx.studentOnboarded.get(candidate.student_id);
		if (!onboarded?.has(hs)) {
			soft.push({
				code: 'not_onboarded',
				message: 'Student has not completed onboarding at this health system',
				entity_refs: { student_id: candidate.student_id, health_system_id: hs }
			});
		}
	}

	// Preceptor capacity (soft): count existing assignments on that date for the
	// preceptor. Capacity is looked up from the context; callers add same-batch
	// occupancy before calling if needed.
	// (Occupancy computed by the caller-provided map is out of scope here; the
	//  DB-backed path below handles the single-candidate case.)

	// Preferred day available (soft): this day sits on an "in a pinch" availability
	// while the preceptor still has an OPEN "preferred" day — one in range where the
	// student is free and the preceptor is under capacity — that could have been
	// used instead (H8). Only evaluated when the caller supplies the preference maps.
	if (ctx.preceptorInPinch?.get(candidate.preceptor_id)?.has(candidate.date)) {
		const preferred = ctx.preceptorPreferredDates?.get(candidate.preceptor_id) ?? [];
		const cap = ctx.preceptorMaxStudents.get(candidate.preceptor_id) ?? 1;
		const hasOpenPreferred = preferred.some(
			(d) =>
				d !== candidate.date &&
				!existingByStudentDate.has(`${candidate.student_id}:${d}`) &&
				(ctx.preceptorDateOccupancy?.get(`${candidate.preceptor_id}:${d}`) ?? 0) < cap
		);
		if (hasOpenPreferred) {
			soft.push({
				code: 'preferred_day_available',
				message: 'Assigned on an "in a pinch" day while a preferred day was available',
				entity_refs: { preceptor_id: candidate.preceptor_id }
			});
		}
	}

	return { valid: hard.length === 0, hard, soft };
}

function todayUTC(): string {
	return new Date().toISOString().split('T')[0];
}

export interface CandidateValidationOptions {
	/** Today's date (YYYY-MM-DD); injectable for tests. */
	today?: string;
	/**
	 * Emit the create-time-only soft codes `past_date` and `over_required_days`.
	 * Off by default so whole-schedule health checks are not flooded with
	 * "this day already happened" noise for every historical assignment.
	 */
	checkCreateTimeCodes?: boolean;
}

/**
 * Build a validation context for a schedule and validate a single candidate
 * against the live database. Used by the manual-create path (Step 09) and the
 * unified assignment dialog (Step 18).
 */
export async function validateAssignmentCandidate(
	db: Kysely<DB>,
	scheduleId: string,
	candidate: AssignmentCandidate,
	options: CandidateValidationOptions = {}
): Promise<CandidateValidation> {
	const period = await db
		.selectFrom('scheduling_periods')
		.select(['start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();

	// A non-clinical day (free_day / exam) has no preceptor/clerkship/site to look
	// up or validate (M2/M3); only the student must exist and the day must not
	// clash with another the student holds.
	const isClinical = (candidate.kind ?? 'clinical') === 'clinical';

	const [student, preceptor, clerkship] = await Promise.all([
		db
			.selectFrom('students')
			.select('id')
			.where('id', '=', candidate.student_id)
			.executeTakeFirst(),
		isClinical && candidate.preceptor_id
			? db
					.selectFrom('preceptors')
					.select(['id', 'max_students', 'health_system_id'])
					.where('id', '=', candidate.preceptor_id)
					.executeTakeFirst()
			: Promise.resolve(undefined),
		// A standalone-elective day has no clerkship (E3), so there's nothing to look up.
		candidate.clerkship_id
			? db
					.selectFrom('clerkships')
					.select(['id', 'required_days', 'scheduling_kind'])
					.where('id', '=', candidate.clerkship_id)
					.executeTakeFirst()
			: Promise.resolve(undefined)
	]);

	const hard: Violation[] = [];
	if (!student) hard.push({ code: 'entity_missing', message: 'Student not found' });
	if (isClinical && !preceptor)
		hard.push({ code: 'entity_missing', message: 'Preceptor not found' });
	// Only a day that claims a clerkship must have one that exists.
	if (candidate.clerkship_id && !clerkship)
		hard.push({ code: 'entity_missing', message: 'Clerkship not found' });
	if (hard.length > 0) return { valid: false, hard, soft: [] };

	const soft: Violation[] = [];

	// Same-day session clash (soft). A student may hold more than one assignment per
	// day — a morning and an afternoon are fine — so this is not a hard block, and
	// credit is not capped. We flag only when the new session overlaps one already
	// on the day (two mornings, two afternoons, or a full day overlapping anything).
	// NOT scoped to the schedule on purpose: a student is one physical person per
	// calendar day across every schedule.
	let sameDayQuery = db
		.selectFrom('schedule_assignments')
		.select(['session', 'preceptor_id'])
		.where('student_id', '=', candidate.student_id)
		.where('date', '=', candidate.date);
	if (candidate.excludeId) sameDayQuery = sameDayQuery.where('id', '!=', candidate.excludeId);
	const sameDayRows = await sameDayQuery.execute();
	const candidateSession = normalizeSession(candidate.session);
	const clashingSession = sameDayRows
		.map((r) => normalizeSession(r.session))
		.find((s) => sessionsOverlap(s, candidateSession));
	if (clashingSession) {
		soft.push({
			code: 'session_clash',
			message: `Student already has a ${clashingSession === 'full' ? 'full-day' : clashingSession.toUpperCase()} assignment on ${candidate.date} that overlaps this ${candidateSession === 'full' ? 'full day' : candidateSession.toUpperCase()}`,
			entity_refs: { student_id: candidate.student_id }
		});
	}

	// A non-clinical day (free_day / exam) has no preceptor/clerkship/site, so it
	// skips every clinical check. Beyond the session clash above, only the schedule
	// range and blackout dates apply — both soft/overridable (M2/M3).
	if (!isClinical) {
		if (period && (candidate.date < period.start_date || candidate.date > period.end_date)) {
			soft.push({
				code: 'outside_schedule',
				message: `${candidate.date} is outside the schedule's date range`
			});
		}
		const blackoutNc = await db
			.selectFrom('blackout_dates')
			.select('id')
			.where('schedule_id', '=', scheduleId)
			.where('date', '=', candidate.date)
			.executeTakeFirst();
		if (blackoutNc)
			soft.push({ code: 'blackout_date', message: `${candidate.date} is a blackout date` });
		return { valid: hard.length === 0, hard, soft };
	}

	// Mutual exclusion (soft, L2): the student already has a preceptor that day who
	// is marked not to share a student-day with this candidate's preceptor.
	const sameDayPreceptorIds = [
		...new Set(
			sameDayRows
				.map((r) => r.preceptor_id)
				.filter((p): p is string => p !== null && p !== candidate.preceptor_id)
		)
	];
	if (sameDayPreceptorIds.length > 0) {
		const exclusions = await db
			.selectFrom('preceptor_mutual_exclusions')
			.select(['preceptor_a_id', 'preceptor_b_id'])
			.where((eb) =>
				eb.or([
					eb('preceptor_a_id', '=', candidate.preceptor_id),
					eb('preceptor_b_id', '=', candidate.preceptor_id)
				])
			)
			.execute();
		const excludedWith = new Set<string>();
		for (const e of exclusions) {
			excludedWith.add(e.preceptor_a_id === candidate.preceptor_id ? e.preceptor_b_id : e.preceptor_a_id);
		}
		const clashPreceptor = sameDayPreceptorIds.find((p) => excludedWith.has(p));
		if (clashPreceptor) {
			soft.push({
				code: 'mutual_exclusion',
				message: `This preceptor is marked not to share a day with another preceptor already assigned on ${candidate.date}`,
				entity_refs: {
					student_id: candidate.student_id,
					preceptor_id: candidate.preceptor_id,
					other_preceptor_id: clashPreceptor
				}
			});
		}
	}

	// Block-week conflict (soft, L3). Block (inpatient) clerkships occupy whole
	// weeks; a scattered (outpatient) day can't share a week a block already
	// consumes, and adding a block to a week that holds scattered days conflicts too.
	// A standalone-elective day (no clerkship) is treated as scattered.
	{
		const candidateKind = candidate.clerkship_id
			? normalizeSchedulingKind(clerkship?.scheduling_kind)
			: 'scattered';
		const weekStart = weekKey(candidate.date);
		const weekEnd = new Date(`${weekStart}T00:00:00Z`);
		weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
		const weekEndStr = weekEnd.toISOString().slice(0, 10);
		let weekQuery = db
			.selectFrom('schedule_assignments as sa')
			.leftJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
			.select(['sa.id as id', 'c.scheduling_kind as scheduling_kind'])
			.where('sa.student_id', '=', candidate.student_id)
			.where('sa.date', '>=', weekStart)
			.where('sa.date', '<=', weekEndStr);
		if (candidate.excludeId) weekQuery = weekQuery.where('sa.id', '!=', candidate.excludeId);
		const weekRows = await weekQuery.execute();
		const weekKinds = weekRows.map((r) => normalizeSchedulingKind(r.scheduling_kind));
		const hasBlock = weekKinds.includes('block');
		const hasScattered = weekKinds.includes('scattered');
		if (candidateKind === 'scattered' && hasBlock) {
			soft.push({
				code: 'block_week_conflict',
				message: `The week of ${candidate.date} is already used by an inpatient block, which occupies the whole week`,
				entity_refs: { student_id: candidate.student_id }
			});
		} else if (candidateKind === 'block' && hasScattered) {
			soft.push({
				code: 'block_week_conflict',
				message: `This inpatient block occupies the whole week of ${candidate.date}, which already has outpatient days`,
				entity_refs: { student_id: candidate.student_id }
			});
		}
	}

	// Outside schedule range (soft)
	if (period && (candidate.date < period.start_date || candidate.date > period.end_date)) {
		soft.push({
			code: 'outside_schedule',
			message: `${candidate.date} is outside the schedule's date range`
		});
	}

	// Blackout (soft) — scoped to this schedule (blackouts are per-schedule, P4-d)
	const blackout = await db
		.selectFrom('blackout_dates')
		.select('id')
		.where('schedule_id', '=', scheduleId)
		.where('date', '=', candidate.date)
		.executeTakeFirst();
	if (blackout)
		soft.push({ code: 'blackout_date', message: `${candidate.date} is a blackout date` });

	// Preceptor availability (soft)
	const avail = await db
		.selectFrom('preceptor_availability')
		.select(['is_available', 'preference'])
		.where('preceptor_id', '=', candidate.preceptor_id)
		.where('date', '=', candidate.date)
		.executeTakeFirst();
	if (avail && avail.is_available === 0) {
		soft.push({
			code: 'preceptor_unavailable',
			message: `Preceptor is not available on ${candidate.date}`,
			entity_refs: { preceptor_id: candidate.preceptor_id }
		});
	}

	// Preceptor capacity (soft). Use the single capacity resolver so the Stage 1
	// warning matches the effective per-day cap the engine enforces — an explicit
	// preceptor_capacity_rules row wins over preceptors.max_students (P-06/F-07).
	let capQuery = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('preceptor_id', '=', candidate.preceptor_id)
		.where('date', '=', candidate.date);
	if (candidate.excludeId) capQuery = capQuery.where('id', '!=', candidate.excludeId);
	const sameDay = await capQuery.execute();
	const effectiveRule = await new CapacityChecker(db).resolveCapacityRule(
		candidate.preceptor_id,
		candidate.clerkship_id ?? undefined
	);
	if (sameDay.length >= effectiveRule.maxStudentsPerDay) {
		soft.push({
			code: 'preceptor_capacity',
			message: 'Preceptor is at capacity for this date',
			entity_refs: { preceptor_id: candidate.preceptor_id }
		});
	}

	// Site allowed (soft). A standalone-elective day has no clerkship allowlist.
	if (candidate.site_id && candidate.clerkship_id) {
		const clerkshipId = candidate.clerkship_id;
		const allowed = await db
			.selectFrom('clerkship_sites')
			.select('site_id')
			.where('clerkship_id', '=', clerkshipId)
			.execute();
		if (allowed.length > 0 && !allowed.some((a) => a.site_id === candidate.site_id)) {
			soft.push({
				code: 'site_not_allowed',
				message: 'This site is not among the allowed sites for the clerkship',
				entity_refs: { clerkship_id: clerkshipId, site_id: candidate.site_id }
			});
		}
	}

	// Onboarding (soft)
	if (preceptor?.health_system_id) {
		const onboard = await db
			.selectFrom('student_health_system_onboarding')
			.select('is_completed')
			.where('student_id', '=', candidate.student_id)
			.where('health_system_id', '=', preceptor.health_system_id)
			.executeTakeFirst();
		if (!onboard || onboard.is_completed === 0) {
			soft.push({
				code: 'not_onboarded',
				message: 'Student has not completed onboarding at this health system',
				entity_refs: {
					student_id: candidate.student_id,
					health_system_id: preceptor.health_system_id
				}
			});
		}
	}

	// Outside the student's core preceptor(s) (soft). Only when the student has
	// declared any core preceptors: assigning them to someone outside that set is
	// allowed but flagged for review (client feedback F5).
	const corePreceptors = await db
		.selectFrom('student_core_preceptors')
		.select('preceptor_id')
		.where('student_id', '=', candidate.student_id)
		.execute();
	if (
		corePreceptors.length > 0 &&
		!corePreceptors.some((c) => c.preceptor_id === candidate.preceptor_id)
	) {
		soft.push({
			code: 'outside_core_preceptor',
			message: "This preceptor is not one of the student's core preceptors",
			entity_refs: { student_id: candidate.student_id, preceptor_id: candidate.preceptor_id }
		});
	}

	// Create-time-only soft codes. Opt-in so whole-schedule validation is not
	// flooded with "already happened" noise for historical assignments.
	if (options.checkCreateTimeCodes) {
		const today = options.today ?? todayUTC();
		if (candidate.date < today) {
			soft.push({
				code: 'past_date',
				message: `${candidate.date} has already passed`
			});
		}

		const required = clerkship?.required_days ?? 0;
		// Only a core clerkship day (no elective) is measured against the clerkship's
		// required-days budget. An elective day belongs to the elective's own
		// (minimum) requirement, so it neither counts toward nor trips
		// over_required_days for the clerkship — the same split the generation credit
		// path applies (P7-a). Core days are counted excluding elective rows.
		if (required > 0 && !candidate.elective_id && candidate.clerkship_id) {
			const clerkshipId = candidate.clerkship_id;
			let countQuery = db
				.selectFrom('schedule_assignments')
				.select('id')
				.where('student_id', '=', candidate.student_id)
				.where('clerkship_id', '=', clerkshipId)
				.where('elective_id', 'is', null);
			if (candidate.excludeId) countQuery = countQuery.where('id', '!=', candidate.excludeId);
			const existingForClerkship = await countQuery.execute();
			if (existingForClerkship.length + 1 > required) {
				soft.push({
					code: 'over_required_days',
					message: `This is more days than ${required} required for the clerkship`,
					entity_refs: {
						student_id: candidate.student_id,
						clerkship_id: clerkshipId
					}
				});
			}
		}

		// Preferred day available (soft, manual-create only). The chosen day is an
		// "in a pinch" availability for the preceptor, yet the preceptor has an OPEN
		// "preferred" day — one in the schedule range where the student is free and
		// the preceptor is under capacity — that could have been used instead (H8).
		// Advisory: allowed with an override so the coordinator is aware. Gated behind
		// checkCreateTimeCodes so auto-generation (which actively prefers preferred
		// days) is not flagged by mid-run DB state.
		if (avail && avail.is_available === 1 && avail.preference === 'in_a_pinch') {
			const rangeStart = period?.start_date ?? '0000-01-01';
			const rangeEnd = period?.end_date ?? '9999-12-31';
			const preferredRows = await db
				.selectFrom('preceptor_availability')
				.select('date')
				.where('preceptor_id', '=', candidate.preceptor_id)
				.where('is_available', '=', 1)
				.where('preference', '=', 'preferred')
				.where('date', '>=', rangeStart)
				.where('date', '<=', rangeEnd)
				.where('date', '!=', candidate.date)
				.execute();
			if (preferredRows.length > 0) {
				const dates = preferredRows.map((r) => r.date);
				const [studentBusy, preceptorDays] = await Promise.all([
					db
						.selectFrom('schedule_assignments')
						.select('date')
						.where('student_id', '=', candidate.student_id)
						.where('date', 'in', dates)
						.execute(),
					db
						.selectFrom('schedule_assignments')
						.select('date')
						.where('preceptor_id', '=', candidate.preceptor_id)
						.where('date', 'in', dates)
						.execute()
				]);
				const studentBusyDates = new Set(studentBusy.map((r) => r.date));
				const preceptorCountByDate = new Map<string, number>();
				for (const r of preceptorDays) {
					preceptorCountByDate.set(r.date, (preceptorCountByDate.get(r.date) ?? 0) + 1);
				}
				const cap = preceptor?.max_students ?? 1;
				const hasOpenPreferred = dates.some(
					(d) => !studentBusyDates.has(d) && (preceptorCountByDate.get(d) ?? 0) < cap
				);
				if (hasOpenPreferred) {
					soft.push({
						code: 'preferred_day_available',
						message: 'This is an "in a pinch" day, but a preferred day is available',
						entity_refs: { preceptor_id: candidate.preceptor_id }
					});
				}
			}
		}
	}

	return { valid: hard.length === 0, hard, soft };
}
