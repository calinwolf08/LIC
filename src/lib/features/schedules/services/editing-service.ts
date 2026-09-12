/**
 * Schedule Editing Service Layer
 *
 * Functions for manual schedule editing operations
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, ScheduleAssignments } from '$lib/db/types';
import type { UpdateAssignmentInput } from '../schemas.js';
import { NotFoundError } from '$lib/api/errors';
import {
	getAssignmentById,
	updateAssignment as updateAssignmentBase,
	checkElectiveBelongsToClerkship
} from './assignment-service.js';
import {
	validateAssignmentCandidate,
	type AssignmentCandidate,
	type Violation
} from '$lib/features/scheduling/services/assignment-validation';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:schedules:editing');

/**
 * Result type for editing operations.
 *
 * Every edit path (reassign, date change, swap) runs the single
 * `validateAssignmentCandidate` validator (Phase 1b.3), so it returns the same
 * hard/soft envelope as manual creation. `valid`/`errors` are kept as a
 * convenience surface: `valid` is false when there are hard violations or
 * unaccepted soft violations; `errors` carries their messages.
 */
export interface EditResult {
	valid: boolean;
	errors: string[];
	hard: Violation[];
	soft: Violation[];
	assignment?: Selectable<ScheduleAssignments>;
}

/** Options every edit path accepts for the override envelope. */
export interface EditOptions {
	/** Soft-violation codes the user explicitly accepted. */
	overrideCodes?: string[];
	overrideNote?: string | null;
	/** Accept every soft violation (blanket override). */
	force?: boolean;
	/** Today's date (YYYY-MM-DD); injectable for tests. */
	today?: string;
	/**
	 * When true, an unaccepted soft violation blocks the edit (the confirm-dialog
	 * edit path, which collects overrides). When false (the default, used by
	 * calendar reassign/swap/date-drag), only hard violations block; soft
	 * violations are surfaced as warnings and accepted codes are still persisted.
	 */
	blockOnSoft?: boolean;
}

/**
 * Evaluate a proposed change to an assignment through the single validator.
 * Returns the hard/soft violations, whether the change is blocked, and the soft
 * codes that should be persisted (the triggered ones the user accepted).
 */
async function evaluateEdit(
	db: Kysely<DB>,
	current: Selectable<ScheduleAssignments>,
	changes: Partial<
		Pick<AssignmentCandidate, 'preceptor_id' | 'clerkship_id' | 'site_id' | 'date' | 'elective_id'>
	>,
	opts: EditOptions
): Promise<{ hard: Violation[]; soft: Violation[]; blocked: boolean; persistedCodes: string[] }> {
	const candidate: AssignmentCandidate = {
		student_id: current.student_id,
		preceptor_id: changes.preceptor_id ?? current.preceptor_id,
		clerkship_id: changes.clerkship_id ?? current.clerkship_id,
		site_id: changes.site_id !== undefined ? changes.site_id : current.site_id,
		// The effective elective of the merged day, so over_required_days measures a
		// core clerkship day against the clerkship and leaves elective days alone (P7-a).
		elective_id: changes.elective_id !== undefined ? changes.elective_id : current.elective_id,
		date: changes.date ?? current.date,
		excludeId: current.id ?? undefined
	};
	const v = await validateAssignmentCandidate(db, current.schedule_id ?? '', candidate, {
		today: opts.today,
		checkCreateTimeCodes: true
	});
	const accepted = new Set(opts.overrideCodes ?? []);
	const unaccepted = opts.force ? [] : v.soft.filter((s) => !accepted.has(s.code));
	const blocked = v.hard.length > 0 || (opts.blockOnSoft === true && unaccepted.length > 0);
	const triggered = v.soft.map((s) => s.code);
	const persistedCodes = opts.force ? triggered : triggered.filter((c) => accepted.has(c));
	return { hard: v.hard, soft: v.soft, blocked, persistedCodes };
}

/** Build the `errors` convenience list from a blocked evaluation. */
function blockingMessages(
	hard: Violation[],
	soft: Violation[],
	opts: EditOptions
): string[] {
	const accepted = new Set(opts.overrideCodes ?? []);
	const blockingSoft =
		opts.blockOnSoft === true && !opts.force ? soft.filter((s) => !accepted.has(s.code)) : [];
	return [...hard, ...blockingSoft].map((v) => v.message);
}

/** Persist accepted override codes on an assignment after an edit. */
async function persistOverrideCodes(
	db: Kysely<DB>,
	assignmentId: string,
	codes: string[],
	note: string | null | undefined
): Promise<void> {
	await db
		.updateTable('schedule_assignments')
		.set({
			override_codes: JSON.stringify(codes),
			override_note: codes.length > 0 ? (note ?? null) : null,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', assignmentId)
		.execute();
}

/**
 * Reassign a student to a different preceptor
 * @param dryRun If true, validate only without saving
 */
export async function reassignToPreceptor(
	db: Kysely<DB>,
	assignmentId: string,
	newPreceptorId: string,
	dryRun: boolean = false,
	opts: EditOptions = {}
): Promise<EditResult> {
	log.debug('Reassigning to preceptor', { assignmentId, newPreceptorId, dryRun });

	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		log.warn('Assignment not found for reassignment', { assignmentId });
		throw new NotFoundError('Assignment');
	}

	const { hard, soft, blocked, persistedCodes } = await evaluateEdit(
		db,
		assignment,
		{ preceptor_id: newPreceptorId },
		opts
	);

	if (blocked) {
		log.warn('Reassignment blocked', { assignmentId, newPreceptorId, hard, soft });
		return { valid: false, errors: blockingMessages(hard, soft, opts), hard, soft };
	}

	if (dryRun) {
		return { valid: true, errors: [], hard: [], soft };
	}

	const updated = await updateAssignmentBase(db, assignmentId, { preceptor_id: newPreceptorId }, true);
	await persistOverrideCodes(db, assignmentId, persistedCodes, opts.overrideNote);

	log.info('Assignment reassigned', {
		assignmentId,
		oldPreceptorId: assignment.preceptor_id,
		newPreceptorId
	});

	return { valid: true, errors: [], hard: [], soft, assignment: updated };
}

/**
 * Update an assignment's fields through the single validator (Phase 1b.3).
 *
 * This is the checked edit path used by `PATCH /assignments/[id]`. It runs
 * `validateAssignmentCandidate` over the merged candidate, enforces the
 * elective-belongs-to-clerkship rule (P-01), applies the override envelope, and
 * — when accepted — persists the changed fields plus the accepted override codes.
 */
export async function updateAssignmentChecked(
	db: Kysely<DB>,
	assignmentId: string,
	changes: {
		preceptor_id?: string;
		clerkship_id?: string;
		site_id?: string | null;
		elective_id?: string | null;
		date?: string;
		status?: string;
	},
	opts: EditOptions = {}
): Promise<EditResult> {
	const current = await getAssignmentById(db, assignmentId);
	if (!current) {
		throw new NotFoundError('Assignment');
	}

	const { hard, soft, blocked, persistedCodes } = await evaluateEdit(
		db,
		current,
		{
			preceptor_id: changes.preceptor_id,
			clerkship_id: changes.clerkship_id,
			site_id: changes.site_id,
			elective_id: changes.elective_id,
			date: changes.date
		},
		{ ...opts, blockOnSoft: true }
	);

	// An elective must belong to the (possibly changed) clerkship — hard block.
	if (changes.elective_id) {
		const effectiveClerkship = changes.clerkship_id ?? current.clerkship_id;
		const electiveViolation = await checkElectiveBelongsToClerkship(
			db,
			changes.elective_id,
			effectiveClerkship
		);
		if (electiveViolation) hard.push(electiveViolation);
	}

	if (blocked || hard.length > 0) {
		return { valid: false, errors: blockingMessages(hard, soft, opts), hard, soft };
	}

	const updated = await db
		.updateTable('schedule_assignments')
		.set({
			...(changes.preceptor_id !== undefined ? { preceptor_id: changes.preceptor_id } : {}),
			...(changes.clerkship_id !== undefined ? { clerkship_id: changes.clerkship_id } : {}),
			...(changes.site_id !== undefined ? { site_id: changes.site_id } : {}),
			...(changes.elective_id !== undefined ? { elective_id: changes.elective_id } : {}),
			...(changes.date !== undefined ? { date: changes.date } : {}),
			...(changes.status !== undefined ? { status: changes.status } : {}),
			override_codes: JSON.stringify(persistedCodes),
			override_note: persistedCodes.length > 0 ? (opts.overrideNote ?? null) : null,
			updated_at: new Date().toISOString()
		})
		.where('id', '=', assignmentId)
		.returningAll()
		.executeTakeFirstOrThrow();

	return { valid: true, errors: [], hard: [], soft, assignment: updated };
}

/**
 * Change the date of an assignment
 * @param dryRun If true, validate only without saving
 */
export async function changeAssignmentDate(
	db: Kysely<DB>,
	assignmentId: string,
	newDate: string,
	dryRun: boolean = false,
	opts: EditOptions = {}
): Promise<EditResult> {
	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	const { hard, soft, blocked, persistedCodes } = await evaluateEdit(
		db,
		assignment,
		{ date: newDate },
		opts
	);

	if (blocked) {
		return { valid: false, errors: blockingMessages(hard, soft, opts), hard, soft };
	}

	if (dryRun) {
		return { valid: true, errors: [], hard: [], soft };
	}

	const updated = await updateAssignmentBase(db, assignmentId, { date: newDate }, true);
	await persistOverrideCodes(db, assignmentId, persistedCodes, opts.overrideNote);

	return { valid: true, errors: [], hard: [], soft, assignment: updated };
}

/**
 * Swap the preceptors of two assignments
 * @param dryRun If true, validate only without saving
 */
export async function swapAssignments(
	db: Kysely<DB>,
	assignmentId1: string,
	assignmentId2: string,
	dryRun: boolean = false,
	opts: EditOptions = {}
): Promise<{
	valid: boolean;
	errors: string[];
	hard: Violation[];
	soft: Violation[];
	assignments?: Selectable<ScheduleAssignments>[];
}> {
	const [assignment1, assignment2] = await Promise.all([
		getAssignmentById(db, assignmentId1),
		getAssignmentById(db, assignmentId2)
	]);

	if (!assignment1 || !assignment2) {
		throw new NotFoundError('Assignment');
	}

	// Validate both sides of the swap through the single validator.
	const [eval1, eval2] = await Promise.all([
		evaluateEdit(db, assignment1, { preceptor_id: assignment2.preceptor_id }, opts),
		evaluateEdit(db, assignment2, { preceptor_id: assignment1.preceptor_id }, opts)
	]);

	const hard = [...eval1.hard, ...eval2.hard];
	const soft = [...eval1.soft, ...eval2.soft];

	if (eval1.blocked || eval2.blocked) {
		return {
			valid: false,
			errors: [
				...blockingMessages(eval1.hard, eval1.soft, opts),
				...blockingMessages(eval2.hard, eval2.soft, opts)
			],
			hard,
			soft
		};
	}

	if (dryRun) {
		return { valid: true, errors: [], hard: [], soft };
	}

	// Swap preceptors (both sides validated before either is written).
	const [updated1, updated2] = await Promise.all([
		updateAssignmentBase(db, assignmentId1, { preceptor_id: assignment2.preceptor_id }, true),
		updateAssignmentBase(db, assignmentId2, { preceptor_id: assignment1.preceptor_id }, true)
	]);
	await Promise.all([
		persistOverrideCodes(db, assignmentId1, eval1.persistedCodes, opts.overrideNote),
		persistOverrideCodes(db, assignmentId2, eval2.persistedCodes, opts.overrideNote)
	]);

	return { valid: true, errors: [], hard: [], soft, assignments: [updated1, updated2] };
}

/**
 * Validate proposed changes to an assignment
 */
export async function validateEdit(
	db: Kysely<DB>,
	assignmentId: string,
	updates: UpdateAssignmentInput
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
	// Get current assignment
	const assignment = await getAssignmentById(db, assignmentId);
	if (!assignment) {
		throw new NotFoundError('Assignment');
	}

	const { hard, soft, blocked } = await evaluateEdit(
		db,
		assignment,
		{
			preceptor_id: updates.preceptor_id ?? undefined,
			clerkship_id: updates.clerkship_id ?? undefined,
			site_id: updates.site_id ?? undefined,
			date: updates.date ?? undefined
		},
		{}
	);

	return {
		valid: !blocked,
		errors: hard.map((v) => v.message),
		warnings: soft.map((v) => v.message)
	};
}

/**
 * Bulk reassign multiple assignments to a new preceptor
 */
export async function bulkReassign(
	db: Kysely<DB>,
	assignmentIds: string[],
	newPreceptorId: string
): Promise<{ successful: string[]; failed: { id: string; errors: string[] }[] }> {
	const successful: string[] = [];
	const failed: { id: string; errors: string[] }[] = [];

	for (const assignmentId of assignmentIds) {
		try {
			const result = await reassignToPreceptor(db, assignmentId, newPreceptorId, false);

			if (result.valid) {
				successful.push(assignmentId);
			} else {
				failed.push({ id: assignmentId, errors: result.errors });
			}
		} catch (error) {
			failed.push({
				id: assignmentId,
				errors: [error instanceof Error ? error.message : 'Unknown error']
			});
		}
	}

	return { successful, failed };
}

/**
 * Clear assignments for one schedule (for regeneration).
 *
 * Scoped to `scheduleId` (review finding F-02/F-04): a generation or "clear"
 * action must never touch another schedule's rows — not even another of the
 * same user's schedules that shares a student. Deletion is by the explicit
 * `schedule_id` column (migration 100), which every write path now sets.
 *
 * @param scheduleId The schedule whose assignments to clear.
 * @param fromDate Optional: only clear assignments on or after this date
 *   (preserves past assignments). Locked assignments are always preserved.
 */
export async function clearAllAssignments(
	db: Kysely<DB>,
	scheduleId: string,
	fromDate?: string
): Promise<number> {
	log.debug('Clearing assignments', { scheduleId, fromDate: fromDate || 'all' });

	// Locked (preset) assignments are always preserved by auto-generation.
	let query = db
		.deleteFrom('schedule_assignments')
		.where('schedule_id', '=', scheduleId)
		.where('locked', '=', 0);

	if (fromDate) {
		query = query.where('date', '>=', fromDate);
	}

	const result = await query.executeTakeFirst();
	const deletedCount = Number(result.numDeletedRows || 0);

	log.info('Assignments cleared', {
		scheduleId,
		fromDate: fromDate || 'all',
		deletedCount
	});

	return deletedCount;
}
