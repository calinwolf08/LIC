/**
 * Schedule Assignment Reassignment API
 *
 * POST /api/schedules/assignments/[id]/reassign - Reassign to different preceptor
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	notFoundResponse,
	handleApiError
} from '$lib/api/responses';
import { NotFoundError } from '$lib/api/errors';
import { reassignToPreceptor } from '$lib/features/schedules/services/editing-service';
import { assignmentIdSchema } from '$lib/features/schedules/schemas';
import { uuidSchema } from '$lib/validation/common-schemas';
import { z, ZodError } from 'zod';

/**
 * Schema for reassignment request
 */
const reassignSchema = z.object({
	new_preceptor_id: uuidSchema,
	dry_run: z.boolean().optional().default(false)
});

/**
 * POST /api/schedules/assignments/[id]/reassign
 * Reassign student to different preceptor
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });
		const body = await request.json();
		const { new_preceptor_id, dry_run } = reassignSchema.parse(body);

		const result = await reassignToPreceptor(db, id, new_preceptor_id, dry_run);

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
