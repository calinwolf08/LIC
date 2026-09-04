/**
 * Manual assignment creation (Step 09, extended in Step 17)
 *
 * POST /api/schedules/assignments
 *   Body (single):  { student_id, preceptor_id, clerkship_id, site_id?, date, ... }
 *   Body (days):    { ..., dates: string[] }                      ← explicit day list
 *   Body (range):   { ..., start_date, end_date, weekdays?, skip_blackouts? }
 *
 *   Common: { locked?, dry_run?, force?, override_codes?: string[],
 *             override_note?: string, side_effects?: [...] }
 *
 * dry_run returns validation only. Hard violations always reject; soft
 * violations reject unless their code appears in `override_codes` (or
 * force=true), in which case the accepted codes are persisted on the row.
 * `side_effects` are applied in the same transaction as the creation.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { json } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/api/responses';
import {
	getActiveScheduleId,
	assertEntityInSchedule,
	assertAssignmentInSchedule
} from '$lib/api/schedule-context';
import { isApiError } from '$lib/api/errors';
import {
	createManualAssignment,
	createManualAssignmentsBulk,
	applyOverrideSideEffects,
	type OverrideSideEffect
} from '$lib/features/schedules/services/assignment-service';
import {
	validateAssignmentCandidate,
	type Violation
} from '$lib/features/scheduling/services/assignment-validation';
import { hasAutogen } from '$lib/server/entitlements';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-assignments');

/** Thrown inside the create transaction so side effects roll back with it. */
class RejectedCreate extends Error {
	constructor(
		readonly hard: Violation[],
		readonly soft: Violation[]
	) {
		super('Assignment rejected');
	}
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const sideEffectSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('bump_preceptor_capacity'),
		preceptor_id: z.string().min(1),
		by: z.number().int().min(1).optional()
	}),
	z.object({
		kind: z.literal('mark_preceptor_available'),
		preceptor_id: z.string().min(1),
		site_id: z.string().min(1),
		dates: z.array(z.string().regex(DATE)).min(1)
	}),
	z.object({
		kind: z.literal('remove_conflicting_assignment'),
		assignment_id: z.string().min(1)
	})
]);

const baseSchema = z.object({
	student_id: z.string().min(1),
	preceptor_id: z.string().min(1),
	clerkship_id: z.string().min(1),
	// Site is required on create (a client-only rule is not a rule): preceptor
	// availability is site-scoped and the mark-available side effect needs it.
	site_id: z.string().min(1, 'Select a site'),
	// Optional elective this day satisfies; validated against the clerkship in the
	// service (P-01).
	elective_id: z.string().min(1).nullish(),
	locked: z.boolean().optional(),
	dry_run: z.boolean().optional(),
	force: z.boolean().optional(),
	override_codes: z.array(z.string()).optional(),
	override_note: z.string().max(1000).nullish(),
	side_effects: z.array(sideEffectSchema).optional(),
	// Edit-mode dry runs pass the assignment being edited so it isn't validated
	// against itself (double-book / capacity / required-days). Ignored on create.
	excludeId: z.string().min(1).optional()
});

const singleSchema = baseSchema.extend({ date: z.string().regex(DATE) });
const datesSchema = baseSchema.extend({ dates: z.array(z.string().regex(DATE)).min(1) });
const bulkSchema = baseSchema.extend({
	start_date: z.string().regex(DATE),
	end_date: z.string().regex(DATE),
	weekdays: z.array(z.number().int().min(0).max(6)).optional(),
	skip_blackouts: z.boolean().optional()
});

/**
 * Ownership guards for a create payload: every entity the assignment references,
 * plus every side-effect target, must be in the caller's schedule. Throws
 * NotFoundError (→ 404) on the first miss, before any write.
 */
async function guardCreatePayload(
	scheduleId: string,
	input: {
		student_id: string;
		preceptor_id: string;
		clerkship_id: string;
		site_id?: string | null;
		side_effects?: OverrideSideEffect[];
	}
): Promise<void> {
	await assertEntityInSchedule(db, scheduleId, 'student', input.student_id);
	await assertEntityInSchedule(db, scheduleId, 'preceptor', input.preceptor_id);
	await assertEntityInSchedule(db, scheduleId, 'clerkship', input.clerkship_id);
	if (input.site_id) {
		await assertEntityInSchedule(db, scheduleId, 'site', input.site_id);
	}
	for (const effect of input.side_effects ?? []) {
		if (effect.kind === 'bump_preceptor_capacity') {
			await assertEntityInSchedule(db, scheduleId, 'preceptor', effect.preceptor_id);
		} else if (effect.kind === 'mark_preceptor_available') {
			await assertEntityInSchedule(db, scheduleId, 'preceptor', effect.preceptor_id);
			await assertEntityInSchedule(db, scheduleId, 'site', effect.site_id);
		} else if (effect.kind === 'remove_conflicting_assignment') {
			await assertAssignmentInSchedule(db, scheduleId, effect.assignment_id);
		}
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	const raw = (body ?? {}) as Record<string, unknown>;
	const isDateList = Array.isArray(raw.dates);
	const isRange = typeof raw.start_date === 'string';

	// Stage 2 gating, server side: `locked` is an auto-generation concept, so a
	// caller without the entitlement never gets it — even by forging the field.
	const mayLock = hasAutogen(locals);

	try {
		if (isDateList || isRange) {
			const input = isDateList ? datesSchema.parse(body) : bulkSchema.parse(body);
			await guardCreatePayload(scheduleId, input as unknown as Parameters<typeof guardCreatePayload>[1]);
			const previewDate = isDateList
				? (input as z.infer<typeof datesSchema>).dates[0]
				: (input as z.infer<typeof bulkSchema>).start_date;

			if (input.dry_run) {
				const preview = await validateAssignmentCandidate(
					db,
					scheduleId,
					{
						student_id: input.student_id,
						preceptor_id: input.preceptor_id,
						clerkship_id: input.clerkship_id,
						site_id: input.site_id ?? null,
						date: previewDate
					},
					{ checkCreateTimeCodes: true }
				);
				return successResponse({ valid: preview.valid, hard: preview.hard, soft: preview.soft });
			}

			const result = await db.transaction().execute(async (trx) => {
				if (input.side_effects?.length) {
					await applyOverrideSideEffects(trx, input.side_effects as OverrideSideEffect[]);
				}
				return createManualAssignmentsBulk(
					trx,
					scheduleId,
					{ ...input, elective_id: input.elective_id ?? null, locked: mayLock ? input.locked : false },
					{ force: input.force }
				);
			});
			return successResponse(result);
		}

		const input = singleSchema.parse(body);
		await guardCreatePayload(scheduleId, input as unknown as Parameters<typeof guardCreatePayload>[1]);
		const candidate = {
			student_id: input.student_id,
			preceptor_id: input.preceptor_id,
			clerkship_id: input.clerkship_id,
			site_id: input.site_id ?? null,
			date: input.date,
			excludeId: input.excludeId
		};

		if (input.dry_run) {
			const v = await validateAssignmentCandidate(db, scheduleId, candidate, {
				checkCreateTimeCodes: true
			});
			return successResponse({ valid: v.valid, hard: v.hard, soft: v.soft });
		}

		// A rejected create must also roll back any side effects the caller asked
		// for, so the throw/catch below is deliberate.
		const result = await db.transaction().execute(async (trx) => {
			if (input.side_effects?.length) {
				await applyOverrideSideEffects(trx, input.side_effects as OverrideSideEffect[]);
			}
			const created = await createManualAssignment(
				trx,
				scheduleId,
				{
					...candidate,
					elective_id: input.elective_id ?? null,
					locked: mayLock ? input.locked : false,
					override_codes: input.override_codes,
					override_note: input.override_note
				},
				{ force: input.force }
			);
			if (!created.ok) throw new RejectedCreate(created.hard, created.soft);
			return created;
		});

		return successResponse({ assignment: result.assignment, warnings: result.warnings }, 201);
	} catch (err) {
		if (err instanceof RejectedCreate) {
			return json(
				{
					success: false,
					error: {
						message:
							err.hard.length > 0
								? 'Assignment has conflicts that must be resolved'
								: 'Assignment has warnings that must be accepted before it can be created',
						hard: err.hard,
						soft: err.soft
					}
				},
				{ status: 422 }
			);
		}
		if (err instanceof z.ZodError) {
			return errorResponse('Invalid request', 400, err.issues);
		}
		if (isApiError(err)) {
			return errorResponse(err.message, err.status, err.details);
		}
		log.error('Failed to create manual assignment', { error: err });
		return errorResponse('Failed to create assignment', 500);
	}
};
