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

export type ViolationCode =
	| 'student_double_booked'
	| 'preceptor_unavailable'
	| 'blackout_date'
	| 'preceptor_capacity'
	| 'site_not_allowed'
	| 'outside_schedule'
	| 'not_onboarded'
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
	clerkship_id: string;
	site_id?: string | null;
	date: string;
	/** Existing assignment id to exclude from conflict checks (edits). */
	excludeId?: string;
}

/**
 * Codes a user may knowingly accept. Persisted on the assignment as
 * `override_codes` so the schedule-health panel can list them for review.
 */
export const OVERRIDABLE_CODES = [
	'preceptor_unavailable',
	'preceptor_capacity',
	'blackout_date',
	'not_onboarded',
	'over_required_days',
	'past_date',
	'site_not_allowed',
	'outside_schedule'
] as const satisfies readonly ViolationCode[];

export type OverrideCode = (typeof OVERRIDABLE_CODES)[number];

const OVERRIDABLE_SET: ReadonlySet<string> = new Set(OVERRIDABLE_CODES);

export function isOverrideCode(code: string): code is OverrideCode {
	return OVERRIDABLE_SET.has(code);
}

/** Human labels for override codes, for the review list and confirm copy. */
export const OVERRIDE_LABELS: Record<OverrideCode, string> = {
	preceptor_unavailable: 'Preceptor not available',
	preceptor_capacity: 'Preceptor over capacity',
	blackout_date: 'Blackout date',
	not_onboarded: 'Student not onboarded',
	over_required_days: 'More days than required',
	past_date: 'Date already passed',
	site_not_allowed: 'Site not approved for clerkship',
	outside_schedule: 'Outside the schedule range'
};

export interface CandidateValidation {
	valid: boolean;
	hard: Violation[];
	soft: Violation[];
}

/** Only this code is a hard block; everything else is overridable. */
export const HARD_CODES: ReadonlySet<ViolationCode> = new Set([
	'student_double_booked',
	'entity_missing'
]);

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
	if (!ctx.existingClerkshipIds.has(candidate.clerkship_id))
		hard.push({ code: 'entity_missing', message: 'Clerkship not found' });
	if (hard.length > 0) return { valid: false, hard, soft };

	// Student double-booking (hard)
	const existing = existingByStudentDate.get(`${candidate.student_id}:${candidate.date}`);
	if (existing && existing !== candidate.excludeId) {
		hard.push({
			code: 'student_double_booked',
			message: `Student already has an assignment on ${candidate.date}`,
			entity_refs: { student_id: candidate.student_id }
		});
	}

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

	// Site not allowed for clerkship (soft)
	if (candidate.site_id) {
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

	const [student, preceptor, clerkship] = await Promise.all([
		db
			.selectFrom('students')
			.select('id')
			.where('id', '=', candidate.student_id)
			.executeTakeFirst(),
		db
			.selectFrom('preceptors')
			.select(['id', 'max_students', 'health_system_id'])
			.where('id', '=', candidate.preceptor_id)
			.executeTakeFirst(),
		db
			.selectFrom('clerkships')
			.select(['id', 'required_days'])
			.where('id', '=', candidate.clerkship_id)
			.executeTakeFirst()
	]);

	const hard: Violation[] = [];
	if (!student) hard.push({ code: 'entity_missing', message: 'Student not found' });
	if (!preceptor) hard.push({ code: 'entity_missing', message: 'Preceptor not found' });
	if (!clerkship) hard.push({ code: 'entity_missing', message: 'Clerkship not found' });
	if (hard.length > 0) return { valid: false, hard, soft: [] };

	const soft: Violation[] = [];

	// Student double-booking (hard)
	let dbQuery = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('student_id', '=', candidate.student_id)
		.where('date', '=', candidate.date);
	if (candidate.excludeId) dbQuery = dbQuery.where('id', '!=', candidate.excludeId);
	const doubleBook = await dbQuery.executeTakeFirst();
	if (doubleBook) {
		hard.push({
			code: 'student_double_booked',
			message: `Student already has an assignment on ${candidate.date}`,
			entity_refs: { student_id: candidate.student_id }
		});
	}

	// Outside schedule range (soft)
	if (period && (candidate.date < period.start_date || candidate.date > period.end_date)) {
		soft.push({
			code: 'outside_schedule',
			message: `${candidate.date} is outside the schedule's date range`
		});
	}

	// Blackout (soft)
	const blackout = await db
		.selectFrom('blackout_dates')
		.select('id')
		.where('date', '=', candidate.date)
		.executeTakeFirst();
	if (blackout)
		soft.push({ code: 'blackout_date', message: `${candidate.date} is a blackout date` });

	// Preceptor availability (soft)
	const avail = await db
		.selectFrom('preceptor_availability')
		.select('is_available')
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
		candidate.clerkship_id
	);
	if (sameDay.length >= effectiveRule.maxStudentsPerDay) {
		soft.push({
			code: 'preceptor_capacity',
			message: 'Preceptor is at capacity for this date',
			entity_refs: { preceptor_id: candidate.preceptor_id }
		});
	}

	// Site allowed (soft)
	if (candidate.site_id) {
		const allowed = await db
			.selectFrom('clerkship_sites')
			.select('site_id')
			.where('clerkship_id', '=', candidate.clerkship_id)
			.execute();
		if (allowed.length > 0 && !allowed.some((a) => a.site_id === candidate.site_id)) {
			soft.push({
				code: 'site_not_allowed',
				message: 'This site is not among the allowed sites for the clerkship',
				entity_refs: { clerkship_id: candidate.clerkship_id, site_id: candidate.site_id }
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
		if (required > 0) {
			let countQuery = db
				.selectFrom('schedule_assignments')
				.select('id')
				.where('student_id', '=', candidate.student_id)
				.where('clerkship_id', '=', candidate.clerkship_id);
			if (candidate.excludeId) countQuery = countQuery.where('id', '!=', candidate.excludeId);
			const existingForClerkship = await countQuery.execute();
			if (existingForClerkship.length + 1 > required) {
				soft.push({
					code: 'over_required_days',
					message: `This is more days than ${required} required for the clerkship`,
					entity_refs: {
						student_id: candidate.student_id,
						clerkship_id: candidate.clerkship_id
					}
				});
			}
		}
	}

	return { valid: hard.length === 0, hard, soft };
}
