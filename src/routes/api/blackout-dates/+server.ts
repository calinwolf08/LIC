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
import { requireActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:blackout-dates');

/**
 * GET /api/blackout-dates
 * Returns the active schedule's blackout dates, optionally filtered by date range
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const startDate = url.searchParams.get('start_date') || undefined;
	const endDate = url.searchParams.get('end_date') || undefined;

	log.debug('Fetching blackout dates', { startDate, endDate });

	try {
		const scheduleId = await requireActiveScheduleId(locals);

		// Validate date range if provided
		if (startDate || endDate) {
			dateRangeSchema.parse({ start_date: startDate, end_date: endDate });
		}

		const blackoutDates = startDate || endDate
			? await getBlackoutDatesByRange(db, scheduleId, startDate, endDate)
			: await getBlackoutDates(db, scheduleId);

		log.info('Blackout dates fetched', {
			count: blackoutDates.length,
			filtered: !!(startDate || endDate)
		});

		return successResponse(blackoutDates);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Date range validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}
		log.error('Failed to fetch blackout dates', { startDate, endDate, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/blackout-dates
 * Creates a new blackout date
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating blackout date');

	try {
		const scheduleId = await requireActiveScheduleId(locals);
		const body = await request.json();
		const validatedData = createBlackoutDateSchema.parse(body);

		const blackoutDate = await createBlackoutDate(db, validatedData, scheduleId);

		log.info('Blackout date created', {
			id: blackoutDate.id,
			date: blackoutDate.date,
			reason: blackoutDate.reason
		});

		return successResponse(blackoutDate, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Blackout date validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}
		log.error('Failed to create blackout date', { error });
		return handleApiError(error);
	}
};
