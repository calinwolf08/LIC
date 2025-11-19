/**
 * Scheduling Period Activation API
 *
 * POST /api/scheduling-periods/[id]/activate - Activate a scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { activateSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';
import { uuidSchema } from '$lib/validation/common-schemas';
import { ZodError } from 'zod';

/**
 * POST /api/scheduling-periods/[id]/activate
 * Activate a scheduling period (deactivates all others)
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const id = uuidSchema.parse(params.id);

		const period = await activateSchedulingPeriod(db, id);

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};
