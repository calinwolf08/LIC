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
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods:id');

/**
 * GET /api/scheduling-periods/[id]
 * Returns a single scheduling period
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching scheduling period', { id: params.id });

	try {
		const id = cuid2Schema.parse(params.id);

		const period = await getSchedulingPeriodById(db, id);

		if (!period) {
			log.warn('Scheduling period not found', { id });
			return errorResponse('Scheduling period not found', 404);
		}

		log.info('Scheduling period fetched', {
			id,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		});

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid scheduling period ID format', { id: params.id });
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch scheduling period', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-periods/[id]
 * Update a scheduling period
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Updating scheduling period', { id: params.id });

	try {
		const id = cuid2Schema.parse(params.id);

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateSchedulingPeriodSchema.parse(body);

		const period = await updateSchedulingPeriod(db, id, validatedData);

		log.info('Scheduling period updated', {
			id,
			name: period.name,
			updatedFields: Object.keys(validatedData)
		});

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Scheduling period update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Scheduling period not found for update', { id: params.id });
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			log.warn('Scheduling period update conflict', {
				id: params.id,
				message: error.message
			});
			return errorResponse(error.message, 409);
		}

		log.error('Failed to update scheduling period', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-periods/[id]
 * Delete a scheduling period
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting scheduling period', { id: params.id });

	try {
		const id = cuid2Schema.parse(params.id);

		await deleteSchedulingPeriod(db, id);

		log.info('Scheduling period deleted', { id });
		return successResponse({ message: 'Scheduling period deleted successfully' });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid scheduling period ID format for deletion', { id: params.id });
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Scheduling period not found for deletion', { id: params.id });
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			log.warn('Scheduling period deletion conflict', {
				id: params.id,
				message: error.message
			});
			return errorResponse(error.message, 409);
		}

		log.error('Failed to delete scheduling period', { id: params.id, error });
		return handleApiError(error);
	}
};
