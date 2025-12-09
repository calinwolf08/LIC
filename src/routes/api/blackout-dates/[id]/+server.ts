/**
 * Blackout Dates API - Individual Resource Endpoints
 *
 * GET /api/blackout-dates/[id] - Get single blackout date
 * DELETE /api/blackout-dates/[id] - Delete blackout date
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError, NotFoundError } from '$lib/api/errors';
import {
	getBlackoutDateById,
	deleteBlackoutDate
} from '$lib/features/blackout-dates/services/blackout-date-service';

/**
 * GET /api/blackout-dates/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const blackoutDate = await getBlackoutDateById(db, params.id);

		if (!blackoutDate) {
			return notFoundResponse('Blackout date');
		}

		return successResponse(blackoutDate);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * DELETE /api/blackout-dates/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await deleteBlackoutDate(db, params.id);

		return successResponse({ deleted: true });
	} catch (error) {
		if (error instanceof NotFoundError) {
			return notFoundResponse('Blackout date');
		}
		return handleApiError(error);
	}
};
