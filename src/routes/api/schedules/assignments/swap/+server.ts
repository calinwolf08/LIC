/**
 * Schedule Assignment Swap API
 *
 * POST /api/schedules/assignments/swap - Swap two assignments
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, notFoundResponse } from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { swapAssignments } from '$lib/features/schedules/services/editing-service.js';
import { requireActiveScheduleId, assertAssignmentInSchedule } from '$lib/api/schedule-context';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:schedules:assignments:swap');

/**
 * Schema for swap request. Accepts the same override envelope as manual
 * creation (Phase 1b.3).
 */
const swapSchema = z.object({
	assignment_id_1: cuid2Schema,
	assignment_id_2: cuid2Schema,
	dry_run: z.boolean().optional().default(false),
	force: z.boolean().optional(),
	override_codes: z.array(z.string()).optional(),
	override_note: z.string().max(1000).nullish()
});

/**
 * POST /api/schedules/assignments/swap
 * Swap the preceptors of two assignments
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Swapping assignments');

	try {
		const body = await request.json();
		const { assignment_id_1, assignment_id_2, dry_run, force, override_codes, override_note } =
			swapSchema.parse(body);

		// Ownership guard: both assignments must belong to the caller's schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertAssignmentInSchedule(db, scheduleId, assignment_id_1);
		await assertAssignmentInSchedule(db, scheduleId, assignment_id_2);

		log.debug('Swap request validated', {
			assignmentId1: assignment_id_1,
			assignmentId2: assignment_id_2,
			dryRun: dry_run
		});

		const result = await swapAssignments(db, assignment_id_1, assignment_id_2, dry_run, {
			force,
			overrideCodes: override_codes,
			overrideNote: override_note
		});

		log.info('Assignments swapped', {
			assignmentId1: assignment_id_1,
			assignmentId2: assignment_id_2,
			dryRun: dry_run,
			valid: result.valid
		});

		if (!dry_run && !result.valid) {
			return json(
				{
					success: false,
					error: {
						message:
							result.hard.length > 0
								? 'Swap has conflicts that must be resolved'
								: 'Swap has warnings that must be accepted first',
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
			log.warn('Swap validation failed', {
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment not found for swap', { message: error.message });
			return notFoundResponse(error.message);
		}

		log.error('Failed to swap assignments', { error });
		return handleApiError(error);
	}
};
