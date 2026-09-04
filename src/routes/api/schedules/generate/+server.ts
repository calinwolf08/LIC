import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { generateScheduleSchema } from '$lib/features/scheduling/schemas';
import { ConfigurableSchedulingEngine } from '$lib/features/scheduling/engine/configurable-scheduling-engine';
import { buildSchedulingContext } from '$lib/features/scheduling/services/context-builder';
import { analyzeRegenerationImpact } from '$lib/features/scheduling/services/regeneration-service';
import type { RegenerationStrategy } from '$lib/features/scheduling/services/regeneration-service';
import {
	logRegenerationEvent,
	createRegenerationAuditLog
} from '$lib/features/scheduling/services/audit-service';
import { clearAllAssignments } from '$lib/features/schedules/services/editing-service';
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

		// ---- Preview: analyse impact, write nothing --------------------------
		if (isPreview) {
			const legacyContext = await buildScopedContext(
				db,
				scheduleId,
				studentIds,
				clerkshipIds,
				validatedData.startDate,
				validatedData.endDate
			);
			const impact = await analyzeRegenerationImpact(
				db,
				legacyContext,
				regenerateFromDate,
				validatedData.endDate,
				strategy
			);
			return successResponse({
				preview: true,
				impact: {
					summary: impact.summary,
					pastAssignments: {
						count: impact.pastAssignmentsCount,
						assignments: impact.pastAssignments.map((a) => ({
							id: a.id,
							studentId: a.student_id,
							preceptorId: a.preceptor_id,
							clerkshipId: a.clerkship_id,
							date: a.date,
							status: a.status
						}))
					},
					futureAssignments: {
						toDeleteCount: impact.deletedCount,
						preservableCount: impact.preservedCount,
						affectedCount: impact.affectedCount,
						replaceableCount: impact.replaceableAssignments.filter((r) => r.replacementPreceptorId)
							.length
					},
					studentProgress: impact.studentProgress
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

			return successResponse({
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

		// ---- Full / minimal-change: clear unlocked future, then regenerate ---
		// (Phase 0 treats both the same at the engine level; the "minimal-change"
		//  preservation path is disabled in the UI until Phase 2.)
		const deletedCount = await clearAllAssignments(db, scheduleId, regenerateFromDate);

		// Credit whatever survived the clear (past + locked) toward requirements
		// so the engine schedules only the remainder (review finding F-01).
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

		return successResponse(
			{
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
				preservedPastAssignments: true,
				preservedFutureAssignments: 0,
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

/** Build a schedule-scoped legacy context for preview impact analysis. */
async function buildScopedContext(
	dbc: Kysely<DB>,
	scheduleId: string,
	studentIds: string[],
	clerkshipIds: string[],
	startDate: string,
	endDate: string
) {
	const [students, clerkships, blackoutRows] = await Promise.all([
		studentIds.length > 0
			? dbc.selectFrom('students').selectAll().where('id', 'in', studentIds).execute()
			: Promise.resolve([]),
		clerkshipIds.length > 0
			? dbc.selectFrom('clerkships').selectAll().where('id', 'in', clerkshipIds).execute()
			: Promise.resolve([]),
		dbc.selectFrom('blackout_dates').select('date').execute()
	]);

	const preceptorRows = await dbc
		.selectFrom('preceptors')
		.innerJoin('schedule_preceptors', 'schedule_preceptors.preceptor_id', 'preceptors.id')
		.selectAll('preceptors')
		.where('schedule_preceptors.schedule_id', '=', scheduleId)
		.execute();

	const preceptorIds = preceptorRows.map((p) => p.id).filter((id): id is string => !!id);
	const availability =
		preceptorIds.length > 0
			? await dbc
					.selectFrom('preceptor_availability')
					.selectAll()
					.where('preceptor_id', 'in', preceptorIds)
					.execute()
			: [];

	return buildSchedulingContext(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		students as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		preceptorRows as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		clerkships as any,
		blackoutRows.map((b) => b.date),
		availability,
		startDate,
		endDate
	);
}
