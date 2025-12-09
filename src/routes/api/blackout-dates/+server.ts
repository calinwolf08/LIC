/**
 * Blackout Dates API - Collection Endpoints
 *
 * GET /api/blackout-dates - List all blackout dates
 * POST /api/blackout-dates - Create new blackout date
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
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
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const startDate = url.searchParams.get('start_date') || undefined;
		const endDate = url.searchParams.get('end_date') || undefined;

		// Validate date range if provided
		if (startDate || endDate) {
			dateRangeSchema.parse({ start_date: startDate, end_date: endDate });
		}

		const blackoutDates = startDate || endDate
			? await getBlackoutDatesByRange(db, startDate, endDate)
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
