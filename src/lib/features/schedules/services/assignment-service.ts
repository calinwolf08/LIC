/**
 * Schedule Assignment Service Layer
 *
 * Business logic and database operations for schedule assignments
 */

import type { Kysely, Selectable, Insertable } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';
import type {
	CreateAssignmentInput,
	UpdateAssignmentInput,
	BulkAssignmentInput,
	AssignmentFilters
} from '../schemas.js';
import { NotFoundError, ConflictError, ValidationError } from '$lib/api/errors';
import { getStudentById } from '$lib/features/students/services/student-service';
import { getPreceptorById } from '$lib/features/preceptors/services/preceptor-service';
import { getClerkshipById } from '$lib/features/clerkships/services/clerkship-service';
import { isDateBlackedOut } from '$lib/features/blackout-dates/services/blackout-date-service';
import { getAvailabilityByDate } from '$lib/features/preceptors/services/availability-service';
import { validateSchedule } from '$lib/features/scheduling/services/schedule-validation';
import { createServerLogger } from '$lib/utils/logger.server';
import {
	validateAssignmentCandidate,
	type AssignmentCandidate,
	type Violation
} from '$lib/features/scheduling/services/assignment-validation';

const log = createServerLogger('service:schedules:assignment');

// ---------------------------------------------------------------------------
// Single persistence path (Phase 1b.8, review finding P-10 / F-14)
// ---------------------------------------------------------------------------

/**
 * A normalized assignment row, source-agnostic. Every write path — manual
 * create, bulk create and the engine commit — builds one of these and hands it
 * to {@link insertAssignments}, so the full column set is written in exactly one
 * place. Adding a column to `schedule_assignments` means editing only this
 * function, not three separate inserts (P-10).
 */
export interface NewAssignmentRow {
	schedule_id: string | null;
	student_id: string;
	preceptor_id: string;
	clerkship_id: string;
	elective_id?: string | null;
	site_id?: string | null;
	date: string;
	status?: string;
	source: 'manual' | 'generated';
	locked?: boolean;
	/** Accepted soft-violation codes to persist on the row. */
	override_codes?: string[];
	override_note?: string | null;
}

/** Map a normalized row onto the full insertable column set, with defaults. */
function toInsertable(row: NewAssignmentRow, timestamp: string): Insertable<ScheduleAssignments> {
	return {
		id: crypto.randomUUID(),
		schedule_id: row.schedule_id,
		student_id: row.student_id,
		preceptor_id: row.preceptor_id,
		clerkship_id: row.clerkship_id,
		elective_id: row.elective_id ?? null,
		site_id: row.site_id ?? null,
		date: row.date,
		status: row.status ?? 'scheduled',
		source: row.source,
		locked: row.locked ? 1 : 0,
		override_codes: JSON.stringify(row.override_codes ?? []),
		override_note:
			(row.override_codes?.length ?? 0) > 0 ? (row.override_note ?? null) : null,
		created_at: timestamp,
		updated_at: timestamp
	};
}

/**
 * The single INSERT path for `schedule_assignments`. All write paths funnel
 * here so every row carries the same, complete column set (P-10). Returns the
 * inserted rows. Callers own their own validation, de-duplication and
 * occupied-slot skipping before calling.
 */
export async function insertAssignments(
	db: Kysely<DB>,
	rows: NewAssignmentRow[]
): Promise<Selectable<ScheduleAssignments>[]> {
	if (rows.length === 0) return [];
	const timestamp = new Date().toISOString();
	return db
		.insertInto('schedule_assignments')
		.values(rows.map((r) => toInsertable(r, timestamp)))
		.returningAll()
		.execute();
}

// ---------------------------------------------------------------------------
// Manual assignment creation (Step 09, extended in Step 17)
// ---------------------------------------------------------------------------

export interface ManualAssignmentInput {
	student_id: string;
	preceptor_id: string;
	clerkship_id: string;
	site_id?: string | null;
	/** Elective this day satisfies, if any. Must belong to the clerkship (P-01). */
	elective_id?: string | null;
	date: string;
	locked?: boolean;
	/** Soft violation codes the user explicitly accepted. */
	override_codes?: string[];
	/** Free text captured alongside the override. */
	override_note?: string | null;
}

/**
 * Verify an elective belongs to a clerkship. Returns a hard `entity_missing`
 * violation when it does not (or does not exist), so an assignment can never tie
 * a day to an elective from another clerkship (P-01).
 */
export async function checkElectiveBelongsToClerkship(
	db: Kysely<DB>,
	electiveId: string,
	clerkshipId: string
): Promise<Violation | null> {
	const elective = await db
		.selectFrom('clerkship_electives')
		.select(['id', 'clerkship_id'])
		.where('id', '=', electiveId)
		.executeTakeFirst();
	if (!elective || elective.clerkship_id !== clerkshipId) {
		return {
			code: 'entity_missing',
			message: 'Elective does not belong to this clerkship',
			entity_refs: { clerkship_id: clerkshipId, elective_id: electiveId }
		};
	}
	return null;
}

export type ManualCreateResult =
	| { ok: true; assignment: Selectable<ScheduleAssignments>; warnings: Violation[] }
	| { ok: false; hard: Violation[]; soft: Violation[] };

export interface ManualCreateOptions {
	/** Accept every soft violation (legacy blanket override). */
	force?: boolean;
	/** Today's date (YYYY-MM-DD); injectable for tests. */
	today?: string;
	/**
	 * Include the create-time soft codes `past_date` / `over_required_days`.
	 * Defaults to true — a manual create is exactly when they matter.
	 */
	checkCreateTimeCodes?: boolean;
}

/**
 * Create a single assignment by hand.
 * - Hard violations always reject.
 * - Soft violations reject unless the user accepted their code (via
 *   `override_codes`) or `force` is set. Accepted codes are persisted on the
 *   row so they can be reviewed later.
 */
export async function createManualAssignment(
	db: Kysely<DB>,
	scheduleId: string,
	input: ManualAssignmentInput,
	opts: ManualCreateOptions = {}
): Promise<ManualCreateResult> {
	const candidate: AssignmentCandidate = {
		student_id: input.student_id,
		preceptor_id: input.preceptor_id,
		clerkship_id: input.clerkship_id,
		site_id: input.site_id ?? null,
		date: input.date
	};
	const result = await validateAssignmentCandidate(db, scheduleId, candidate, {
		today: opts.today,
		checkCreateTimeCodes: opts.checkCreateTimeCodes ?? true
	});

	// An elective must belong to the assignment's clerkship (P-01). This is a hard
	// block, not overridable.
	if (input.elective_id) {
		const electiveViolation = await checkElectiveBelongsToClerkship(
			db,
			input.elective_id,
			input.clerkship_id
		);
		if (electiveViolation) result.hard.push(electiveViolation);
	}

	const accepted = new Set(input.override_codes ?? []);
	const unaccepted = opts.force ? [] : result.soft.filter((v) => !accepted.has(v.code));
	if (result.hard.length > 0 || unaccepted.length > 0) {
		return { ok: false, hard: result.hard, soft: result.soft };
	}

	// Only persist codes that were actually triggered — an accepted code that
	// turned out not to apply is not an override.
	const triggered = result.soft.map((v) => v.code);
	const persistedCodes = opts.force ? triggered : triggered.filter((code) => accepted.has(code));

	const [assignment] = await insertAssignments(db, [
		{
			schedule_id: scheduleId,
			student_id: input.student_id,
			preceptor_id: input.preceptor_id,
			clerkship_id: input.clerkship_id,
			elective_id: input.elective_id ?? null,
			site_id: input.site_id ?? null,
			date: input.date,
			source: 'manual',
			locked: input.locked,
			override_codes: persistedCodes,
			override_note: input.override_note
		}
	]);

	log.info('Manual assignment created', {
		id: assignment.id,
		forced: !!opts.force,
		overrides: persistedCodes
	});
	return { ok: true, assignment, warnings: result.soft };
}

export interface BulkManualInput {
	student_id: string;
	preceptor_id: string;
	clerkship_id: string;
	site_id?: string | null;
	/** Elective these days satisfy, if any. Must belong to the clerkship (P-01). */
	elective_id?: string | null;
	/** Explicit day list (Step 17). Takes precedence over start/end + weekdays. */
	dates?: string[];
	start_date?: string;
	end_date?: string;
	/** 0=Sun … 6=Sat; empty means all days. */
	weekdays?: number[];
	skip_blackouts?: boolean;
	locked?: boolean;
	/** Soft violation codes the user explicitly accepted, applied to every date. */
	override_codes?: string[];
	override_note?: string | null;
}

export interface BulkManualDateResult {
	date: string;
	created: boolean;
	skipped?: 'hard_conflict' | 'blackout' | 'soft_blocked';
	violations?: Violation[];
}

export interface BulkManualResult {
	createdCount: number;
	results: BulkManualDateResult[];
}

function expandDates(start: string, end: string, weekdays: number[] | undefined): string[] {
	const dates: string[] = [];
	const cur = new Date(start + 'T00:00:00.000Z');
	const last = new Date(end + 'T00:00:00.000Z');
	const filter = weekdays && weekdays.length > 0 ? new Set(weekdays) : null;
	while (cur <= last) {
		if (!filter || filter.has(cur.getUTCDay())) {
			dates.push(cur.toISOString().split('T')[0]);
		}
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return dates;
}

/**
 * Resolve the day list for a bulk create: an explicit `dates[]` when given,
 * otherwise the range + weekday-filter form.
 */
function resolveBulkDates(input: BulkManualInput): string[] {
	if (input.dates && input.dates.length > 0) {
		return [...new Set(input.dates)].sort();
	}
	if (!input.start_date || !input.end_date) return [];
	return expandDates(input.start_date, input.end_date, input.weekdays);
}

/**
 * Create assignments over a date range (or an explicit day list). Hard-conflict
 * dates are skipped and reported; soft violations are skipped unless their code
 * was accepted via `override_codes` (or `force` is set).
 */
export async function createManualAssignmentsBulk(
	db: Kysely<DB>,
	scheduleId: string,
	input: BulkManualInput,
	opts: ManualCreateOptions = {}
): Promise<BulkManualResult> {
	const dates = resolveBulkDates(input);

	// Callers may already have a transaction open (the API bundles override side
	// effects with the creation); SQLite has no nested transactions, so reuse it.
	const run = async (trx: Kysely<DB>) => {
		const results: BulkManualDateResult[] = [];
		let createdCount = 0;

		for (const date of dates) {
			const res = await createManualAssignment(
				trx,
				scheduleId,
				{
					student_id: input.student_id,
					preceptor_id: input.preceptor_id,
					clerkship_id: input.clerkship_id,
					site_id: input.site_id ?? null,
					elective_id: input.elective_id ?? null,
					date,
					locked: input.locked,
					override_codes: input.override_codes,
					override_note: input.override_note
				},
				opts
			);
			if (res.ok) {
				createdCount++;
				results.push({ date, created: true, violations: res.warnings });
			} else {
				const skipped = res.hard.length > 0 ? 'hard_conflict' : 'soft_blocked';
				results.push({ date, created: false, skipped, violations: [...res.hard, ...res.soft] });
			}
		}

		return { createdCount, results };
	};

	return db.isTransaction ? run(db) : db.transaction().execute(run);
}

// ---------------------------------------------------------------------------
// Override side effects and review (Step 17)
// ---------------------------------------------------------------------------

/**
 * The follow-up actions the assignment dialog can offer alongside an override.
 * Each one is an explicit, separately audited call — never an implicit side
 * effect of creating an assignment.
 */
export type OverrideSideEffect =
	| { kind: 'bump_preceptor_capacity'; preceptor_id: string; by?: number }
	| { kind: 'mark_preceptor_available'; preceptor_id: string; site_id: string; dates: string[] }
	| { kind: 'remove_conflicting_assignment'; assignment_id: string };

/**
 * Apply one override side effect. Pass a transaction to bundle several with the
 * assignment creation so a failure rolls the whole thing back.
 */
export async function applyOverrideSideEffects(
	db: Kysely<DB>,
	effects: OverrideSideEffect[]
): Promise<void> {
	for (const effect of effects) {
		switch (effect.kind) {
			case 'bump_preceptor_capacity': {
				const preceptor = await db
					.selectFrom('preceptors')
					.select('max_students')
					.where('id', '=', effect.preceptor_id)
					.executeTakeFirst();
				if (!preceptor) throw new NotFoundError('Preceptor');
				await db
					.updateTable('preceptors')
					.set({
						max_students: preceptor.max_students + (effect.by ?? 1),
						updated_at: new Date().toISOString()
					})
					.where('id', '=', effect.preceptor_id)
					.execute();
				log.info('Override side effect: preceptor capacity raised', {
					preceptorId: effect.preceptor_id
				});
				break;
			}
			case 'mark_preceptor_available': {
				const timestamp = new Date().toISOString();
				for (const date of effect.dates) {
					const existing = await db
						.selectFrom('preceptor_availability')
						.select('id')
						.where('preceptor_id', '=', effect.preceptor_id)
						.where('site_id', '=', effect.site_id)
						.where('date', '=', date)
						.executeTakeFirst();
					if (existing?.id) {
						await db
							.updateTable('preceptor_availability')
							.set({ is_available: 1, updated_at: timestamp })
							.where('id', '=', existing.id)
							.execute();
					} else {
						await db
							.insertInto('preceptor_availability')
							.values({
								id: crypto.randomUUID(),
								preceptor_id: effect.preceptor_id,
								site_id: effect.site_id,
								date,
								is_available: 1,
								created_at: timestamp,
								updated_at: timestamp
							})
							.execute();
					}
				}
				log.info('Override side effect: preceptor marked available', {
					preceptorId: effect.preceptor_id,
					dates: effect.dates.length
				});
				break;
			}
			case 'remove_conflicting_assignment': {
				const existing = await getAssignmentById(db, effect.assignment_id);
				if (!existing) throw new NotFoundError('Assignment');
				await db
					.deleteFrom('schedule_assignments')
					.where('id', '=', effect.assignment_id)
					.execute();
				log.info('Override side effect: conflicting assignment removed', {
					assignmentId: effect.assignment_id
				});
				break;
			}
		}
	}
}

export type OverrideStatus = 'active' | 'resolved';

export interface OverrideRecord {
	assignmentId: string;
	date: string;
	studentId: string;
	studentName: string;
	clerkshipId: string;
	clerkshipName: string;
	preceptorId: string;
	preceptorName: string;
	codes: string[];
	note: string | null;
	createdAt: string;
	/**
	 * `active` — at least one accepted code still corresponds to a live condition
	 * (or a code we cannot re-evaluate, kept active to be safe). `resolved` — every
	 * re-checkable code no longer applies (e.g. the student has since onboarded).
	 */
	status: OverrideStatus;
}

/**
 * Codes `validateSchedule` re-evaluates. A code outside this set (e.g.
 * `past_date`, `over_required_days`) cannot be proven resolved, so an override
 * carrying one stays `active` rather than being silently hidden.
 */
const REEVALUABLE_CODES = new Set([
	'not_onboarded',
	'preceptor_unavailable',
	'blackout_date',
	'preceptor_capacity',
	'site_not_allowed',
	'outside_schedule',
	'student_double_booked'
]);

export interface ListOverridesOptions {
	/** Include overrides whose conditions no longer apply. Default false (active only). */
	includeResolved?: boolean;
}

/**
 * Every assignment in the schedule that carries an accepted override, for the
 * calendar's review list (Step 20/32). Each override is re-evaluated against
 * current state: an exception that no longer applies is marked `resolved` and,
 * by default, filtered out — history is not lost, but stale exceptions do not
 * masquerade as outstanding.
 */
export async function listOverrides(
	db: Kysely<DB>,
	scheduleId: string,
	options: ListOverridesOptions = {}
): Promise<OverrideRecord[]> {
	// Assignments scope to a schedule transitively, through schedule_students.
	const rows = await db
		.selectFrom('schedule_assignments as sa')
		.innerJoin('schedule_students as ss', 'ss.student_id', 'sa.student_id')
		.innerJoin('students as st', 'st.id', 'sa.student_id')
		.innerJoin('clerkships as c', 'c.id', 'sa.clerkship_id')
		.innerJoin('preceptors as p', 'p.id', 'sa.preceptor_id')
		.select([
			'sa.id as id',
			'sa.date as date',
			'sa.override_codes as override_codes',
			'sa.override_note as override_note',
			'sa.created_at as created_at',
			'sa.student_id as student_id',
			'st.name as student_name',
			'sa.clerkship_id as clerkship_id',
			'c.name as clerkship_name',
			'sa.preceptor_id as preceptor_id',
			'p.name as preceptor_name'
		])
		.where('ss.schedule_id', '=', scheduleId)
		.where('sa.override_codes', '!=', '[]')
		.orderBy('sa.date', 'asc')
		.execute();

	// Live conditions right now, indexed per assignment (capacity is slot-scoped,
	// so its finding touches every assignment on the over-subscribed day).
	const validation = await validateSchedule(db, scheduleId);
	const liveByAssignment = new Map<string, Set<string>>();
	for (const v of validation.violations) {
		for (const id of v.assignment_ids) {
			const set = liveByAssignment.get(id) ?? new Set<string>();
			set.add(v.code);
			liveByAssignment.set(id, set);
		}
	}

	const records = rows
		.map((r) => {
			const codes = parseCodes(r.override_codes);
			const live = liveByAssignment.get(r.id as string) ?? new Set<string>();
			// Active if any code is either still live, or is one we can't re-check.
			const active = codes.some((c) => !REEVALUABLE_CODES.has(c) || live.has(c));
			return {
				assignmentId: r.id as string,
				date: r.date,
				studentId: r.student_id,
				studentName: r.student_name,
				clerkshipId: r.clerkship_id,
				clerkshipName: r.clerkship_name,
				preceptorId: r.preceptor_id,
				preceptorName: r.preceptor_name,
				codes,
				note: r.override_note,
				createdAt: r.created_at,
				status: (active ? 'active' : 'resolved') as OverrideStatus
			};
		})
		.filter((r) => r.codes.length > 0);

	return options.includeResolved ? records : records.filter((r) => r.status === 'active');
}

export interface GroupedOverride {
	studentId: string;
	studentName: string;
	clerkshipId: string;
	clerkshipName: string;
	preceptorId: string;
	preceptorName: string;
	codes: string[];
	status: OverrideStatus;
	startDate: string;
	endDate: string;
	days: number;
	dates: string[];
	assignmentIds: string[];
	note: string | null;
}

/** YYYY-MM-DD one day after `date`. */
function nextDay(date: string): string {
	const d = new Date(date + 'T00:00:00.000Z');
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().split('T')[0];
}

/**
 * Collapse consecutive days sharing the same (student, clerkship, preceptor,
 * code-set, status) into a single row with a date range — so a four-day
 * double-booking reads as one entry, not four. Never merges across different
 * codes or preceptors.
 */
export function groupOverrides(records: OverrideRecord[]): GroupedOverride[] {
	const keyOf = (r: OverrideRecord) =>
		[r.studentId, r.clerkshipId, r.preceptorId, r.status, [...r.codes].sort().join('|')].join('::');

	const byKey = new Map<string, OverrideRecord[]>();
	for (const r of records) {
		const list = byKey.get(keyOf(r)) ?? [];
		list.push(r);
		byKey.set(keyOf(r), list);
	}

	const groups: GroupedOverride[] = [];
	for (const list of byKey.values()) {
		const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
		let run: OverrideRecord[] = [];
		const flush = () => {
			if (run.length === 0) return;
			const first = run[0];
			groups.push({
				studentId: first.studentId,
				studentName: first.studentName,
				clerkshipId: first.clerkshipId,
				clerkshipName: first.clerkshipName,
				preceptorId: first.preceptorId,
				preceptorName: first.preceptorName,
				codes: [...first.codes].sort(),
				status: first.status,
				startDate: run[0].date,
				endDate: run[run.length - 1].date,
				days: run.length,
				dates: run.map((r) => r.date),
				assignmentIds: run.map((r) => r.assignmentId),
				note: run.map((r) => r.note).find((n) => n) ?? null
			});
			run = [];
		};
		for (const r of sorted) {
			if (run.length === 0 || r.date === nextDay(run[run.length - 1].date)) {
				run.push(r);
			} else {
				flush();
				run.push(r);
			}
		}
		flush();
	}

	return groups.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** `override_codes` is stored as a JSON array of strings; be defensive. */
export function parseCodes(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
	} catch {
		return [];
	}
}

/** Toggle the lock flag on an assignment (preset assignments survive generation). */
export async function setAssignmentLock(
	db: Kysely<DB>,
	id: string,
	locked: boolean
): Promise<Selectable<ScheduleAssignments>> {
	const updated = await db
		.updateTable('schedule_assignments')
		.set({ locked: locked ? 1 : 0, updated_at: new Date().toISOString() })
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirst();
	if (!updated) throw new NotFoundError('Assignment');
	return updated;
}

/**
 * Get all assignments with optional filters
 */
export async function getAssignments(
	db: Kysely<DB>,
	filters?: AssignmentFilters
): Promise<Selectable<ScheduleAssignments>[]> {
	let query = db.selectFrom('schedule_assignments').selectAll();

	if (filters?.student_id) {
		query = query.where('student_id', '=', filters.student_id);
	}

	if (filters?.preceptor_id) {
		query = query.where('preceptor_id', '=', filters.preceptor_id);
	}

	if (filters?.clerkship_id) {
		query = query.where('clerkship_id', '=', filters.clerkship_id);
	}

	if (filters?.start_date && filters?.end_date) {
		query = query.where('date', '>=', filters.start_date).where('date', '<=', filters.end_date);
	} else if (filters?.start_date) {
		query = query.where('date', '>=', filters.start_date);
	} else if (filters?.end_date) {
		query = query.where('date', '<=', filters.end_date);
	}

	return await query.orderBy('date', 'asc').execute();
}

/**
 * Get a single assignment by ID
 * @returns Assignment or null if not found
 */
export async function getAssignmentById(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<ScheduleAssignments> | null> {
	const assignment = await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return assignment || null;
}

/**
 * Get all assignments for a student
 */
export async function getAssignmentsByStudent(
	db: Kysely<DB>,
	studentId: string
): Promise<Selectable<ScheduleAssignments>[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get all assignments for a preceptor
 */
export async function getAssignmentsByPreceptor(
	db: Kysely<DB>,
	preceptorId: string
): Promise<Selectable<ScheduleAssignments>[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get assignments within a date range
 */
export async function getAssignmentsByDateRange(
	db: Kysely<DB>,
	startDate: string,
	endDate: string
): Promise<Selectable<ScheduleAssignments>[]> {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('date', '>=', startDate)
		.where('date', '<=', endDate)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Create a new assignment
 * @throws {ValidationError} If assignment validation fails
 */
export async function createAssignment(
	db: Kysely<DB>,
	data: CreateAssignmentInput
): Promise<Selectable<ScheduleAssignments>> {
	log.debug('Creating assignment', {
		studentId: data.student_id,
		preceptorId: data.preceptor_id,
		clerkshipId: data.clerkship_id,
		date: data.date
	});

	// Legacy, schedule-less create path (kept for internal/test setup only). The
	// production create path is createManualAssignment, which uses the single
	// validateAssignmentCandidate validator. Hard checks only, inline.
	const errors: string[] = [];
	const [student, preceptor, clerkship] = await Promise.all([
		getStudentById(db, data.student_id),
		getPreceptorById(db, data.preceptor_id),
		getClerkshipById(db, data.clerkship_id)
	]);
	if (!student) errors.push('Student not found');
	if (!preceptor) errors.push('Preceptor not found');
	if (!clerkship) errors.push('Clerkship not found');
	if (errors.length === 0) {
		if (await hasStudentConflict(db, data.student_id, data.date)) {
			errors.push('Student already has an assignment on this date');
		}
		if (await hasPreceptorConflict(db, data.preceptor_id, data.date)) {
			errors.push('Preceptor has reached maximum student capacity for this date');
		}
		const availability = await getAvailabilityByDate(db, data.preceptor_id, data.date);
		if (availability && availability.is_available === 0) {
			errors.push(`Preceptor is not available on ${data.date}`);
		}
		if (await isDateBlackedOut(db, data.date)) {
			errors.push(`${data.date} is a blackout date`);
		}
	}
	if (errors.length > 0) {
		log.warn('Assignment creation validation failed', {
			studentId: data.student_id,
			errors
		});
		throw new ValidationError(errors.join('; '));
	}

	const [inserted] = await insertAssignments(db, [
		{
			schedule_id: null,
			student_id: data.student_id,
			preceptor_id: data.preceptor_id,
			clerkship_id: data.clerkship_id,
			date: data.date,
			status: data.status || 'scheduled',
			source: 'manual'
		}
	]);

	log.info('Assignment created', {
		id: inserted.id,
		studentId: inserted.student_id,
		preceptorId: inserted.preceptor_id,
		date: inserted.date
	});

	return inserted;
}

/**
 * Update an existing assignment
 * @param allowModifyPast Optional flag to allow modifying past assignments (admin override)
 * @throws {NotFoundError} If assignment not found
 * @throws {ValidationError} If updated assignment validation fails or date is in the past
 */
export async function updateAssignment(
	db: Kysely<DB>,
	id: string,
	data: UpdateAssignmentInput,
	allowModifyPast: boolean = false
): Promise<Selectable<ScheduleAssignments>> {
	// Check if assignment exists
	const current = await getAssignmentById(db, id);
	if (!current) {
		throw new NotFoundError('Assignment');
	}

	// Check if modifying a past assignment
	const dateCheck = canModifyAssignmentDate(current.date, allowModifyPast);
	if (!dateCheck.allowed) {
		throw new ValidationError(dateCheck.error!);
	}

	// Raw writer. The only invariant it enforces itself is the one true hard rule
	// — a student cannot be in two places on the same day. Every overridable
	// (soft) rule is checked by the callers that own the mutation contract
	// (createManualAssignment and the edit paths in editing-service, both via the
	// single validateAssignmentCandidate validator). Callers that want the
	// hard/soft override envelope must go through those.
	const targetStudent = data.student_id || current.student_id;
	const targetDate = data.date || current.date;
	if (data.student_id || data.date) {
		if (await hasStudentConflict(db, targetStudent, targetDate, id)) {
			throw new ValidationError('Student already has an assignment on this date');
		}
	}

	const updated = await db
		.updateTable('schedule_assignments')
		.set({
			...data,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	return updated;
}

/**
 * Delete an assignment
 * @param allowModifyPast Optional flag to allow deleting past assignments (admin override)
 * @throws {NotFoundError} If assignment not found
 * @throws {ValidationError} If assignment date is in the past
 */
export async function deleteAssignment(
	db: Kysely<DB>,
	id: string,
	allowModifyPast: boolean = false
): Promise<void> {
	const assignment = await getAssignmentById(db, id);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	// Check if deleting a past assignment
	const dateCheck = canModifyAssignmentDate(assignment.date, allowModifyPast);
	if (!dateCheck.allowed) {
		throw new ValidationError(dateCheck.error!);
	}

	await db.deleteFrom('schedule_assignments').where('id', '=', id).execute();
}

/**
 * Bulk create assignments (for algorithm output)
 * De-duplicates by (student_id, date) - only keeps last assignment per student per date
 */
export async function bulkCreateAssignments(
	db: Kysely<DB>,
	data: BulkAssignmentInput,
	scheduleId?: string
): Promise<Selectable<ScheduleAssignments>[]> {
	log.debug('Bulk creating assignments', {
		assignmentCount: data.assignments.length
	});

	// Handle empty array case
	if (data.assignments.length === 0) {
		log.info('Bulk create called with empty array');
		return [];
	}

	// De-duplicate by (student_id, date) - keep only the last occurrence
	// This prevents constraint violations and duplicate bookings
	const assignmentMap = new Map<string, (typeof data.assignments)[0]>();
	for (const assignment of data.assignments) {
		const key = `${assignment.student_id}:${assignment.date}`;
		assignmentMap.set(key, assignment);
	}
	let dedupedAssignments = Array.from(assignmentMap.values());

	// Preserve any assignments that already exist for the same (student, date) —
	// notably locked/preset assignments that survived a regeneration. Skipping
	// them here keeps the existing row and avoids a UNIQUE(student_id, date)
	// violation, so auto-generation always works around locked assignments.
	const studentIds = [...new Set(dedupedAssignments.map((a) => a.student_id))];
	if (studentIds.length > 0) {
		const existing = await db
			.selectFrom('schedule_assignments')
			.select(['student_id', 'date'])
			.where('student_id', 'in', studentIds)
			.execute();
		const taken = new Set(existing.map((e) => `${e.student_id}:${e.date}`));
		if (taken.size > 0) {
			dedupedAssignments = dedupedAssignments.filter(
				(a) => !taken.has(`${a.student_id}:${a.date}`)
			);
		}
	}

	if (dedupedAssignments.length === 0) {
		log.info('Bulk create: all candidate slots already occupied');
		return [];
	}

	const inserted = await insertAssignments(
		db,
		dedupedAssignments.map((assignment) => ({
			schedule_id: scheduleId ?? null,
			student_id: assignment.student_id,
			preceptor_id: assignment.preceptor_id,
			clerkship_id: assignment.clerkship_id,
			date: assignment.date,
			status: assignment.status || 'scheduled',
			source: 'generated' as const
		}))
	);

	log.info('Bulk assignments created', {
		originalCount: data.assignments.length,
		dedupedCount: dedupedAssignments.length,
		insertedCount: inserted.length
	});

	return inserted;
}

/**
 * A single generated assignment as the engine produces it. `siteId` is optional
 * — when absent it is resolved from the preceptor's availability for that date,
 * so generated rows carry a site exactly like manual ones (review finding
 * F-14). `electiveId` ties the day to the elective it satisfies (P-01).
 */
export interface GeneratedAssignmentInput {
	studentId: string;
	preceptorId: string;
	clerkshipId: string;
	date: string;
	electiveId?: string | null;
	siteId?: string | null;
	/**
	 * Soft-violation codes the engine's ProposalValidator accepted (bypassed) for
	 * this day; persisted on the row so a bypassed auto day reads like a manual
	 * override in the health panel (F-11).
	 */
	overrideCodes?: string[];
}

/**
 * A generated candidate that was not inserted because its (student, date) slot
 * is already held by an existing assignment. `blockedBy` is that assignment's id
 * (P-09), or null when the row exists without an id (should not happen).
 */
export type SkippedGeneratedAssignment = GeneratedAssignmentInput & {
	blockedBy: string | null;
};

/**
 * The single persistence path for engine output (review recommendation
 * `03 §2.4`, `08 §P-10`). Both the API route and the engine's own commit go
 * through here, so every generated row is stamped identically:
 * `schedule_id`, resolved `site_id`, `elective_id`, `source='generated'`.
 *
 * Behaviour that must hold for manual/generated interop:
 * - De-duplicates by (student, date).
 * - Skips any (student, date) slot already occupied in the database — this is
 *   how locked and manually created rows survive a generation run. Skipped
 *   candidates are returned separately so the caller can report them (P-09)
 *   rather than dropping them silently.
 *
 * @returns the inserted rows plus the candidates skipped because their slot was
 *          already taken.
 */
export async function insertGeneratedAssignments(
	db: Kysely<DB>,
	scheduleId: string | null,
	assignments: GeneratedAssignmentInput[]
): Promise<{
	inserted: Selectable<ScheduleAssignments>[];
	skipped: SkippedGeneratedAssignment[];
}> {
	if (assignments.length === 0) {
		return { inserted: [], skipped: [] };
	}

	// De-duplicate by (student, date) — a student is one place per day.
	const byKey = new Map<string, GeneratedAssignmentInput>();
	for (const a of assignments) {
		byKey.set(`${a.studentId}:${a.date}`, a);
	}
	const deduped = [...byKey.values()];

	// Skip slots already occupied (locked / manual / earlier rows). Reported, not
	// dropped silently — each skip carries the id of the assignment that holds the
	// slot so the caller can tell the user exactly what blocked the day (P-09).
	const studentIds = [...new Set(deduped.map((a) => a.studentId))];
	const existing =
		studentIds.length > 0
			? await db
					.selectFrom('schedule_assignments')
					.select(['id', 'student_id', 'date'])
					.where('student_id', 'in', studentIds)
					.execute()
			: [];
	const blockingId = new Map(existing.map((e) => [`${e.student_id}:${e.date}`, e.id]));

	const toInsert: GeneratedAssignmentInput[] = [];
	const skipped: SkippedGeneratedAssignment[] = [];
	for (const a of deduped) {
		const blockedBy = blockingId.get(`${a.studentId}:${a.date}`);
		if (blockedBy !== undefined) skipped.push({ ...a, blockedBy });
		else toInsert.push(a);
	}

	if (toInsert.length === 0) {
		log.info('Generated insert: all candidate slots already occupied', {
			skipped: skipped.length
		});
		return { inserted: [], skipped };
	}

	// Resolve site_id from availability for any row that did not carry one.
	const needSite = toInsert.filter((a) => !a.siteId);
	const siteLookup = new Map<string, string | null>();
	if (needSite.length > 0) {
		const preceptorIds = [...new Set(needSite.map((a) => a.preceptorId))];
		const dates = [...new Set(needSite.map((a) => a.date))];
		const availability = await db
			.selectFrom('preceptor_availability')
			.select(['preceptor_id', 'date', 'site_id'])
			.where('preceptor_id', 'in', preceptorIds)
			.where('date', 'in', dates)
			.where('is_available', '=', 1)
			.execute();
		for (const row of availability) {
			siteLookup.set(`${row.preceptor_id}:${row.date}`, row.site_id);
		}
	}

	const inserted = await insertAssignments(
		db,
		toInsert.map((a) => ({
			schedule_id: scheduleId,
			student_id: a.studentId,
			preceptor_id: a.preceptorId,
			clerkship_id: a.clerkshipId,
			elective_id: a.electiveId ?? null,
			site_id: a.siteId ?? siteLookup.get(`${a.preceptorId}:${a.date}`) ?? null,
			date: a.date,
			source: 'generated' as const,
			override_codes: a.overrideCodes ?? [],
			override_note: (a.overrideCodes?.length ?? 0) > 0 ? 'auto-generation bypass' : null
		}))
	);

	log.info('Generated assignments inserted', {
		candidates: assignments.length,
		inserted: inserted.length,
		skipped: skipped.length
	});

	return { inserted, skipped };
}

/**
 * Check if a student has a conflicting assignment on a specific date
 * @param excludeId Optional assignment ID to exclude from conflict check (for updates)
 */
export async function hasStudentConflict(
	db: Kysely<DB>,
	studentId: string,
	date: string,
	excludeId?: string
): Promise<boolean> {
	let query = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('student_id', '=', studentId)
		.where('date', '=', date);

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const conflict = await query.executeTakeFirst();
	return !!conflict;
}

/**
 * Check if a preceptor has reached capacity on a specific date
 * @param excludeId Optional assignment ID to exclude from conflict check (for updates)
 */
export async function hasPreceptorConflict(
	db: Kysely<DB>,
	preceptorId: string,
	date: string,
	excludeId?: string
): Promise<boolean> {
	const preceptor = await getPreceptorById(db, preceptorId);
	if (!preceptor) {
		return true;
	}

	let query = db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('preceptor_id', '=', preceptorId)
		.where('date', '=', date);

	if (excludeId) {
		query = query.where('id', '!=', excludeId);
	}

	const conflicts = await query.execute();
	return conflicts.length >= preceptor.max_students;
}

/**
 * Get student progress for all clerkships
 */
export async function getStudentProgress(
	db: Kysely<DB>,
	studentId: string
): Promise<
	{
		clerkship_id: string;
		clerkship_name: string;
		required_days: number;
		completed_days: number;
		percentage: number;
	}[]
> {
	const assignments = await getAssignmentsByStudent(db, studentId);
	const clerkships = await db.selectFrom('clerkships').selectAll().execute();

	const progress = clerkships.map((clerkship) => {
		const completedDays = assignments.filter((a) => a.clerkship_id === clerkship.id).length;
		const percentage = Math.min(100, Math.round((completedDays / clerkship.required_days) * 100));

		return {
			clerkship_id: clerkship.id!,
			clerkship_name: clerkship.name,
			required_days: clerkship.required_days,
			completed_days: completedDays,
			percentage
		};
	});

	return progress;
}

/**
 * Check if an assignment exists
 */
export async function assignmentExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const assignment = await getAssignmentById(db, id);
	return assignment !== null;
}

/**
 * Helper: Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today.toISOString().split('T')[0];
}

/**
 * Helper: Check if a date string is in the past
 */
export function isDateInPast(dateString: string): boolean {
	const date = new Date(dateString + 'T00:00:00');
	const today = new Date(getTodayDateString() + 'T00:00:00');
	return date < today;
}

/**
 * Helper: Check if modification of a past assignment should be allowed
 * @param dateString The assignment date
 * @param allowModifyPast Override flag (for admin operations)
 */
export function canModifyAssignmentDate(
	dateString: string,
	allowModifyPast: boolean = false
): { allowed: boolean; error?: string } {
	if (allowModifyPast) {
		return { allowed: true };
	}

	if (isDateInPast(dateString)) {
		return {
			allowed: false,
			error: 'Cannot modify assignments in the past. Assignment is locked.'
		};
	}

	return { allowed: true };
}
