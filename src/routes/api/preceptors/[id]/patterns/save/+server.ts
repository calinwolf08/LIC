/**
 * Pattern Save API
 *
 * POST /api/preceptors/[id]/patterns/save - Generate and save availability dates from patterns
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { saveGeneratedDates } from '$lib/features/preceptors/services/pattern-service';
import { savePatternDatesSchema } from '$lib/features/preceptors/pattern-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:patterns:save');

/**
 * POST /api/preceptors/[id]/patterns/save
 * Generate dates from patterns and save to preceptor_availability table
 */
export const POST: RequestHandler = async ({ params, request }) => {
	log.debug('Saving generated pattern dates', { preceptorId: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse request body
		const body = await request.json();
		const validatedData = savePatternDatesSchema.parse({
			preceptor_id: id,
			...body
		});

		const savedCount = await saveGeneratedDates(db, validatedData);

		log.info('Pattern dates saved', {
			preceptorId: id,
			savedCount,
			startDate: validatedData.start_date,
			endDate: validatedData.end_date
		});

		return successResponse({
			message: 'Availability dates saved successfully',
			saved_dates: savedCount
		});
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern save validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for pattern save', { preceptorId: params.id });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to save pattern dates', { preceptorId: params.id, error });
		return handleApiError(error);
	}
};
