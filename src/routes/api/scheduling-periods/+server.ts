/**
 * Scheduling Periods API
 *
 * GET /api/scheduling-periods - Get all scheduling periods
 * POST /api/scheduling-periods - Create a new scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, ConflictError, handleApiError } from '$lib/api/errors';
import {
	getSchedulingPeriods,
	createSchedulingPeriod
} from '$lib/features/scheduling/services/scheduling-period-service';
import { createSchedulingPeriodSchema } from '$lib/features/preceptors/pattern-schemas';
import { ZodError } from 'zod';

/**
 * GET /api/scheduling-periods
 * Returns all scheduling periods
 */
export const GET: RequestHandler = async () => {
	try {
		const periods = await getSchedulingPeriods(db);

		return successResponse(periods);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-periods
 * Create a new scheduling period
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse and validate request body
		const body = await request.json();
		const validatedData = createSchedulingPeriodSchema.parse(body);

		const period = await createSchedulingPeriod(db, validatedData);

		return successResponse(period, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
