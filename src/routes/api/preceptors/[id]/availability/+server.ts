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
} from '$lib/features/preceptors/services/availability-service.js';
import { bulkAvailabilitySchema, dateRangeSchema } from '$lib/features/preceptors/availability-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas.js';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:availability');

/**
 * GET /api/preceptors/[id]/availability
 * Returns availability for a preceptor, optionally filtered by date range
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');

	log.debug('Fetching preceptor availability', {
		preceptorId: params.id,
		startDate,
		endDate
	});

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		let availability;

		if (startDate && endDate) {
			// Validate date range
			const dateRange = dateRangeSchema.parse({ start_date: startDate, end_date: endDate });
			availability = await getAvailabilityByDateRange(db, id, dateRange);

			log.info('Preceptor availability fetched (date range)', {
				preceptorId: id,
				count: availability.length,
				startDate,
				endDate
			});
		} else {
			availability = await getAvailability(db, id);

			log.info('Preceptor availability fetched (all)', {
				preceptorId: id,
				count: availability.length
			});
		}

		return successResponse(availability);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Availability query validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch preceptor availability', {
			preceptorId: params.id,
			error
		});
		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors/[id]/availability
 * Bulk update availability for a preceptor
 */
export const POST: RequestHandler = async ({ params, request }) => {
	log.debug('Bulk updating preceptor availability', { preceptorId: params.id });

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

		log.info('Preceptor availability updated', {
			preceptorId: id,
			recordsUpdated: availability.length
		});

		return successResponse(availability);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Availability update validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for availability update', {
				preceptorId: params.id
			});
			return errorResponse(error.message, 404);
		}

		log.error('Failed to update preceptor availability', {
			preceptorId: params.id,
			error
		});
		return handleApiError(error);
	}
};
