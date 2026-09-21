/**
 * Schedule Assignment Reassignment API
 *
 * POST /api/schedules/assignments/[id]/reassign - Reassign to different preceptor
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, notFoundResponse } from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { reassignToPreceptor } from '$lib/features/schedules/services/editing-service.js';
import { assignmentIdSchema } from '$lib/features/schedules/schemas.js';
import {
	requireActiveScheduleId,
	assertAssignmentInSchedule,
	assertEntityInSchedule
} from '$lib/api/schedule-context';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:schedules:assignments:reassign');

/**
 * Schema for reassignment request. Accepts the same override envelope as manual
 * creation (Phase 1b.3): soft violations reject with 422 unless their code is in
 * `override_codes` (or `force`).
 */
const reassignSchema = z.object({
	new_preceptor_id: cuid2Schema,
	dry_run: z.boolean().optional().default(false),
	force: z.boolean().optional(),
	override_codes: z.array(z.string()).optional(),
	override_note: z.string().max(1000).nullish()
});

/**
 * POST /api/schedules/assignments/[id]/reassign
 * Reassign student to different preceptor
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	log.debug('Reassigning assignment', { id: params.id });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });
		const body = await request.json();
		const { new_preceptor_id, dry_run, force, override_codes, override_note } =
			reassignSchema.parse(body);

		// Ownership guard: both the assignment and the target preceptor must be in
		// the caller's schedule, or reassignment becomes a cross-tenant vector.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertAssignmentInSchedule(db, scheduleId, id);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', new_preceptor_id);

		const result = await reassignToPreceptor(db, id, new_preceptor_id, dry_run, {
			force,
			overrideCodes: override_codes,
			overrideNote: override_note
		});

		log.info('Assignment reassigned', {
			id,
			newPreceptorId: new_preceptor_id,
			dryRun: dry_run,
			valid: result.valid
		});

		// A blocked non-dry-run edit returns the 422 hard/soft envelope, matching
		// the create path so the UI can offer the same overrides.
		if (!dry_run && !result.valid) {
			return json(
				{
					success: false,
					error: {
						message:
							result.hard.length > 0
								? 'Reassignment has conflicts that must be resolved'
								: 'Reassignment has warnings that must be accepted first',
						hard: result.hard,
						soft: result.soft
					}
				},
				{ status: 422 }
			);
		}

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Reassignment validation failed', {
				id: params.id,
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment or preceptor not found for reassignment', {
				id: params.id,
				message: error.message
			});
			return notFoundResponse(error.message);
		}

		log.error('Failed to reassign assignment', { id: params.id, error });
		return handleApiError(error);
	}
};
