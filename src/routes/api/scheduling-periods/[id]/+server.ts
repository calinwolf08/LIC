/**
 * Individual Scheduling Period API
 *
 * GET /api/scheduling-periods/[id] - Get a single scheduling period
 * PUT /api/scheduling-periods/[id] - Update a scheduling period
 * DELETE /api/scheduling-periods/[id] - Delete a scheduling period
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
	getSchedulingPeriodById,
	updateSchedulingPeriod,
	deleteSchedulingPeriod
} from '$lib/features/scheduling/services/scheduling-period-service';
import { updateSchedulingPeriodSchema } from '$lib/features/preceptors/pattern-schemas';
import { uuidSchema } from '$lib/validation/common-schemas';
import { ZodError } from 'zod';

/**
 * GET /api/scheduling-periods/[id]
 * Returns a single scheduling period
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const id = uuidSchema.parse(params.id);

		const period = await getSchedulingPeriodById(db, id);

		if (!period) {
			return errorResponse('Scheduling period not found', 404);
		}

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-periods/[id]
 * Update a scheduling period
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const id = uuidSchema.parse(params.id);

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateSchedulingPeriodSchema.parse(body);

		const period = await updateSchedulingPeriod(db, id, validatedData);

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-periods/[id]
 * Delete a scheduling period
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const id = uuidSchema.parse(params.id);

		await deleteSchedulingPeriod(db, id);

		return successResponse({ message: 'Scheduling period deleted successfully' });
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
