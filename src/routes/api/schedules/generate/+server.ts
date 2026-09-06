import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { generateScheduleSchema } from '$lib/features/scheduling/schemas';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import {
	planRegeneration,
	applyRegenerationDeletions
} from '$lib/features/scheduling/services/regeneration-service';
import type { RegenerationStrategy } from '$lib/features/scheduling/services/regeneration-service';
import {
	logRegenerationEvent,
	createRegenerationAuditLog,
	recordGenerationRun
} from '$lib/features/scheduling/services/audit-service';
import {
	insertGeneratedAssignments,
	type GeneratedAssignmentInput
} from '$lib/features/schedules/services/assignment-service';
import { requireActiveScheduleId, getScheduleRange } from '$lib/api/schedule-context';
import { getTodayUTC } from '$lib/features/scheduling/utils/date-utils';
import { createServerLogger } from '$lib/utils/logger.server';
import { requireAutogen } from '$lib/server/entitlements';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { ZodError } from 'zod';

const log = createServerLogger('api:schedules-generate');

/**
 * POST /api/schedules/generate — auto-generate the active schedule (Stage 2).
 *
 * Scope (review Phase 0): the run is confined to the caller's active schedule.
 * Students, clerkships and preceptors come from the `schedule_*` junctions;
 * deletion and every generated row are scoped to the schedule id; the requested
 * date range must lie inside the schedule's own range. Existing/past/locked days
 * are credited toward requirements instead of being re-scheduled.
 *
 * Strategies: `full-reoptimize` (default) and `minimal-change` clear unlocked
 * future assignments from the cutoff and regenerate; `completion` keeps every
 * existing assignment and only fills remaining gaps.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireAutogen(locals);
	const scheduleId = await requireActiveScheduleId(locals);
	log.info('Schedule generation request received', { scheduleId });

	const startedAt = Date.now();
	try {
		const body = await request.json();
		const validatedData = generateScheduleSchema.parse(body);

		// The requested range must fall within the active schedule's own range —
		// generation never places days outside the schedule it belongs to.
		const range = await getScheduleRange(db, scheduleId);
		if (validatedData.startDate < range.start || validatedData.endDate > range.end) {
			return errorResponse(
				`Requested range ${validatedData.startDate}–${validatedData.endDate} is outside the schedule range ${range.start}–${range.end}`,
				400
			);
		}

		const regenerateFromDate = validatedData.regenerateFromDate || getTodayUTC();
		const strategy: RegenerationStrategy = validatedData.strategy || 'full-reoptimize';
		const isPreview = validatedData.preview || false;
		const bypassedConstraints = validatedData.bypassedConstraints || [];

		// Entities in this schedule (the only ones the engine may touch).
		const [studentIds, clerkshipIds] = await Promise.all([
			scheduleStudentIds(db, scheduleId),
			scheduleClerkshipIds(db, scheduleId)
		]);

		log.info('Scope resolved', {
			scheduleId,
			studentCount: studentIds.length,
			clerkshipCount: clerkshipIds.length
		});

		// ---- Preview: plan impact, write nothing -----------------------------
		// Preview and apply share the SAME planRegeneration classification, so the
		// numbers a user sees are exactly what apply will do (review finding F-12).
		if (isPreview) {
			const plan = await planRegeneration(db, scheduleId, {
				cutoff: regenerateFromDate,
				strategy
			});
			return successResponse({
				preview: true,
				strategy,
				impact: {
					summary: plan.summary,
					pastAssignments: { count: plan.summary.preservedPast },
					futureAssignments: {
						toDeleteCount: plan.summary.deletedFuture,
						preservableCount: plan.summary.preservedFuture
					},
					lockedPreserved: plan.summary.preservedLocked
				}
			});
		}

		const engine = new ConfigurableSchedulingEngine(db);

		// ---- Completion: keep everything, only fill gaps ---------------------
		if (strategy === 'completion') {
			const creditBefore = await computeCredit(db, scheduleId);

			const result = await engine.schedule(studentIds, clerkshipIds, {
				startDate: validatedData.startDate,
				endDate: validatedData.endDate,
				scheduleId,
				credit: creditBefore.credit,
				electiveCredit: creditBefore.electiveCredit,
				enableFallbacks: true,
				dryRun: true,
				bypassedConstraints
			});

			const { inserted, skipped } = await insertGeneratedAssignments(
				db,
				scheduleId,
				toGeneratedRows(result.assignments)
			);
			const studentsCompleted = new Set(inserted.map((a) => a.student_id)).size;

			await logRegenerationEvent(db, {
				strategy: 'completion',
				regenerateFromDate: validatedData.startDate,
				endDate: validatedData.endDate,
				pastAssignmentsCount: creditBefore.totalExisting,
				futureAssignmentsDeleted: 0,
				futureAssignmentsPreserved: creditBefore.totalExisting,
				affectedAssignments: 0,
				newAssignmentsGenerated: inserted.length,
				success: result.success,
				reason: 'api_request',
				userId: locals.session?.user?.id,
				notes: `Completion: preserved ${creditBefore.totalExisting}, generated ${inserted.length}, skipped ${skipped.length}. Bypassed: ${bypassedConstraints.join(', ') || 'none'}`
			});

			const completionRunId = await recordGenerationRun(db, {
				scheduleId,
				userId: locals.session?.user?.id,
				mode: 'completion',
				preview: false,
				success: result.success,
				durationMs: Date.now() - startedAt,
				options: {
					startDate: validatedData.startDate,
					endDate: validatedData.endDate,
					bypassedConstraints
				},
				plan: { preservedExisting: creditBefore.totalExisting, generated: inserted.length },
				result: {
					statistics: result.statistics,
					unmetRequirements: result.unmetRequirements,
					violations: result.violations
				}
			});

			return successResponse({
				runId: completionRunId,
				assignments: inserted,
				success: result.success,
				unmetRequirements: result.unmetRequirements,
				violations: result.violations,
				summary: {
					totalAssignments: inserted.length,
					totalViolations: result.violations.length,
					unmetRequirementsCount: result.unmetRequirements.length
				},
				strategy: 'completion',
				schedulingPeriodId: scheduleId,
				existingAssignmentsPreserved: creditBefore.totalExisting,
				newAssignmentsGenerated: inserted.length,
				studentsCompleted,
				skippedExistingSlots: skipped.length,
				skippedDetails: toSkippedDetails(skipped),
				bypassedConstraints,
				message: `Generated ${inserted.length} new assignments. ${creditBefore.totalExisting} existing assignments preserved${skipped.length > 0 ? `; ${skipped.length} slots left to existing assignments` : ''}.`
			});
		}

		// ---- Full / minimal-change: plan, delete the plan's delete-set by id, ---
		// then regenerate. full-reoptimize deletes all unlocked future rows;
		// minimal-change keeps the future rows that are still valid today and
		// deletes only the invalid ones (review finding F-12). Deletion is by id
		// after planning, never a date-range delete (F-02/F-04).
		const plan = await planRegeneration(db, scheduleId, {
			cutoff: regenerateFromDate,
			strategy
		});
		const deletedCount = await applyRegenerationDeletions(db, plan.deleteIds);

		// Credit everything that survived (past + locked + kept-valid future) toward
		// requirements so the engine schedules only the remainder (review finding F-01).
		const creditAfterClear = await computeCredit(db, scheduleId);

		const result = await engine.schedule(studentIds, clerkshipIds, {
			startDate: regenerateFromDate,
			endDate: validatedData.endDate,
			scheduleId,
			credit: creditAfterClear.credit,
			electiveCredit: creditAfterClear.electiveCredit,
			enableTeamFormation: true,
			enableFallbacks: true,
			dryRun: true,
			bypassedConstraints
		});

		const { inserted, skipped } = await insertGeneratedAssignments(
			db,
			scheduleId,
			toGeneratedRows(result.assignments)
		);

		await logRegenerationEvent(
			db,
			createRegenerationAuditLog(
				strategy,
				regenerateFromDate,
				validatedData.endDate,
				creditAfterClear.totalExisting,
				deletedCount,
				creditAfterClear.totalExisting,
				0,
				inserted.length,
				result.success,
				{
					reason: 'api_request',
					userId: locals.session?.user?.id,
					notes: `Generated ${inserted.length} assignments (skipped ${skipped.length} occupied slots)`
				}
			)
		);

		const runId = await recordGenerationRun(db, {
			scheduleId,
			userId: locals.session?.user?.id,
			mode: strategy,
			preview: false,
			success: result.success,
			durationMs: Date.now() - startedAt,
			options: {
				startDate: validatedData.startDate,
				endDate: validatedData.endDate,
				cutoff: regenerateFromDate,
				bypassedConstraints
			},
			plan: plan.summary,
			result: {
				statistics: result.statistics,
				unmetRequirements: result.unmetRequirements,
				violations: result.violations
			}
		});

		return successResponse(
			{
				runId,
				assignments: inserted,
				success: result.success,
				unmetRequirements: result.unmetRequirements,
				violations: result.violations,
				summary: {
					totalAssignments: inserted.length,
					totalViolations: result.violations.length,
					unmetRequirementsCount: result.unmetRequirements.length
				},
				regeneratedFrom: regenerateFromDate,
				strategy,
				preservedPastAssignments: plan.summary.preservedPast,
				preservedLockedAssignments: plan.summary.preservedLocked,
				preservedFutureAssignments: plan.summary.preservedFuture,
				deletedFutureAssignments: deletedCount,
				totalPastAssignments: creditAfterClear.totalExisting,
				skippedExistingSlots: skipped.length,
				skippedDetails: toSkippedDetails(skipped),
				schedulingPeriodId: scheduleId
			},
			200
		);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Schedule generation validation failed', {
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}
		log.error('Schedule generation failed', {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined
		});
		return errorResponse(
			`Failed to generate schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
			500
		);
	}
};

/** Student ids linked to the schedule. */
async function scheduleStudentIds(dbc: Kysely<DB>, scheduleId: string): Promise<string[]> {
	const rows = await dbc
		.selectFrom('schedule_students')
		.select('student_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	return rows.map((r) => r.student_id).filter(Boolean);
}

/** Clerkship ids linked to the schedule. */
async function scheduleClerkshipIds(dbc: Kysely<DB>, scheduleId: string): Promise<string[]> {
	const rows = await dbc
		.selectFrom('schedule_clerkships')
		.select('clerkship_id')
		.where('schedule_id', '=', scheduleId)
		.execute();
	return rows.map((r) => r.clerkship_id).filter(Boolean);
}

/**
 * Days already satisfied per student, split into the clerkship's non-elective
 * portion (rows with no `elective_id`) and each elective (rows carrying one).
 * Scoped to the schedule via the `schedule_id` column.
 */
async function computeCredit(
	dbc: Kysely<DB>,
	scheduleId: string
): Promise<{
	credit: Map<string, Map<string, number>>;
	electiveCredit: Map<string, Map<string, number>>;
	totalExisting: number;
}> {
	const rows = await dbc
		.selectFrom('schedule_assignments')
		.select(['student_id', 'clerkship_id', 'elective_id'])
		.where('schedule_id', '=', scheduleId)
		.execute();

	const credit = new Map<string, Map<string, number>>();
	const electiveCredit = new Map<string, Map<string, number>>();
	const bump = (m: Map<string, Map<string, number>>, a: string, b: string) => {
		if (!m.has(a)) m.set(a, new Map());
		const inner = m.get(a)!;
		inner.set(b, (inner.get(b) ?? 0) + 1);
	};

	for (const r of rows) {
		if (r.elective_id) bump(electiveCredit, r.student_id, r.elective_id);
		else bump(credit, r.student_id, r.clerkship_id);
	}
	return { credit, electiveCredit, totalExisting: rows.length };
}

/** Map engine proposals to the persistence input, carrying the elective link. */
function toGeneratedRows(
	assignments: Array<{
		studentId: string;
		preceptorId: string;
		clerkshipId: string;
		date: string;
		electiveId?: string | null;
	}>
): GeneratedAssignmentInput[] {
	return assignments.map((a) => ({
		studentId: a.studentId,
		preceptorId: a.preceptorId,
		clerkshipId: a.clerkshipId,
		date: a.date,
		electiveId: a.electiveId ?? null
	}));
}

/**
 * Shape the skipped generated candidates for the response (P-09): the user
 * learns exactly which (student, date) days generation could not fill because a
 * manual/locked row already holds the slot, and the id of the blocking row.
 */
function toSkippedDetails(
	skipped: Array<{
		studentId: string;
		clerkshipId: string;
		date: string;
		blockedBy: string | null;
	}>
) {
	return skipped.map((s) => ({
		studentId: s.studentId,
		clerkshipId: s.clerkshipId,
		date: s.date,
		blockedByAssignmentId: s.blockedBy
	}));
}

