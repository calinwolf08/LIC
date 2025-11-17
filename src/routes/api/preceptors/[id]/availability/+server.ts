/**
 * Preceptor Availability API
 *
 * GET /api/preceptors/[id]/availability - Get availability for a preceptor
 * POST /api/preceptors/[id]/availability - Bulk update availability
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import {
	getAvailability,
	getAvailabilityByDateRange,
	bulkUpdateAvailability
} from '$lib/features/preceptors/services/availability-service';
import { bulkAvailabilitySchema, dateRangeSchema } from '$lib/features/preceptors/availability-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors/[id]/availability
 * Returns availability for a preceptor, optionally filtered by date range
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Check for date range query params
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		let availability;

		if (startDate && endDate) {
			// Validate date range
			const dateRange = dateRangeSchema.parse({ start_date: startDate, end_date: endDate });
			availability = await getAvailabilityByDateRange(db, id, dateRange);
		} else {
			availability = await getAvailability(db, id);
		}

		return successResponse(availability);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors/[id]/availability
 * Bulk update availability for a preceptor
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = bulkAvailabilitySchema.parse({
			preceptor_id: id,
			...body
		});

		const availability = await bulkUpdateAvailability(db, validatedData);

		return successResponse(availability);
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
