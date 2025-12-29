/**
 * Schedule Assignment Swap API
 *
 * POST /api/schedules/assignments/swap - Swap two assignments
 */

import type { RequestHandler} from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { swapAssignments } from '$lib/features/schedules/services/editing-service.js';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:schedules:assignments:swap');

/**
 * Schema for swap request
 */
const swapSchema = z.object({
	assignment_id_1: cuid2Schema,
	assignment_id_2: cuid2Schema,
	dry_run: z.boolean().optional().default(false)
});

/**
 * POST /api/schedules/assignments/swap
 * Swap the preceptors of two assignments
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Swapping assignments');

	try {
		const body = await request.json();
		const { assignment_id_1, assignment_id_2, dry_run } = swapSchema.parse(body);

		log.debug('Swap request validated', {
			assignmentId1: assignment_id_1,
			assignmentId2: assignment_id_2,
			dryRun: dry_run
		});

		const result = await swapAssignments(db, assignment_id_1, assignment_id_2, dry_run);

		log.info('Assignments swapped', {
			assignmentId1: assignment_id_1,
			assignmentId2: assignment_id_2,
			dryRun: dry_run,
			success: result.success
		});

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Swap validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
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
