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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods');

/**
 * GET /api/scheduling-periods
 * Returns all scheduling periods
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching all scheduling periods');

	try {
		const periods = await getSchedulingPeriods(db);

		log.info('Scheduling periods fetched', { count: periods.length });
		return successResponse(periods);
	} catch (error) {
		log.error('Failed to fetch scheduling periods', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-periods
 * Create a new scheduling period
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Creating scheduling period');

	try {
		// Parse and validate request body
		const body = await request.json();
		const validatedData = createSchedulingPeriodSchema.parse(body);

		const period = await createSchedulingPeriod(db, validatedData);

		log.info('Scheduling period created', {
			id: period.id,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		});

		return successResponse(period, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Scheduling period validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Scheduling period conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to create scheduling period', { error });
		return handleApiError(error);
	}
};
