/**
 * Blackout Dates API - Individual Blackout Date Endpoints
 *
 * GET /api/blackout-dates/[id] - Get single blackout date
 * DELETE /api/blackout-dates/[id] - Delete blackout date
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
import {
	getBlackoutDateById,
	deleteBlackoutDate
} from '$lib/features/blackout-dates/services/blackout-date-service';
import { blackoutDateIdSchema } from '$lib/features/blackout-dates/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/blackout-dates/[id]
 * Returns a single blackout date
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = blackoutDateIdSchema.parse({ id: params.id });

		const blackoutDate = await getBlackoutDateById(db, id);

		if (!blackoutDate) {
			return notFoundResponse('Blackout date');
		}

		return successResponse(blackoutDate);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/blackout-dates/[id]
 * Deletes a blackout date
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = blackoutDateIdSchema.parse({ id: params.id });

		await deleteBlackoutDate(db, id);

		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Blackout date');
		}

		return handleApiError(error);
	}
};
