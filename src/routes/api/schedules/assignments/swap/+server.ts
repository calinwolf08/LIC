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
import { swapAssignments } from '$lib/features/schedules/services/editing-service';
import { uuidSchema } from '$lib/validation/common-schemas';
import { z, ZodError } from 'zod';

/**
 * Schema for swap request
 */
const swapSchema = z.object({
	assignment_id_1: uuidSchema,
	assignment_id_2: uuidSchema,
	dry_run: z.boolean().optional().default(false)
});

/**
 * POST /api/schedules/assignments/swap
 * Swap the preceptors of two assignments
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { assignment_id_1, assignment_id_2, dry_run } = swapSchema.parse(body);

		const result = await swapAssignments(db, assignment_id_1, assignment_id_2, dry_run);

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse(error.message);
		}

		return handleApiError(error);
	}
};
