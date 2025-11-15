/**
 * Blackout Dates API - Collection Endpoints
 *
 * GET /api/blackout-dates - List all blackout dates (optionally filter by date range)
 * POST /api/blackout-dates - Create new blackout date
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	handleApiError
} from '$lib/api/responses';
import {
	getBlackoutDates,
	getBlackoutDatesByRange,
	createBlackoutDate
} from '$lib/features/blackout-dates/services/blackout-date-service';
import { createBlackoutDateSchema, dateRangeSchema } from '$lib/features/blackout-dates/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/blackout-dates
 * Returns all blackout dates, optionally filtered by date range
 * Query params:
 *   - start_date: YYYY-MM-DD (optional)
 *   - end_date: YYYY-MM-DD (optional)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		// Validate date range if provided
		if (startDate || endDate) {
			dateRangeSchema.parse({
				start_date: startDate || undefined,
				end_date: endDate || undefined
			});
		}

		const blackoutDates =
			startDate || endDate
				? await getBlackoutDatesByRange(db, startDate || undefined, endDate || undefined)
				: await getBlackoutDates(db);

		return successResponse(blackoutDates);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * POST /api/blackout-dates
 * Creates a new blackout date
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = createBlackoutDateSchema.parse(body);

		const blackoutDate = await createBlackoutDate(db, validatedData);

		return successResponse(blackoutDate, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
