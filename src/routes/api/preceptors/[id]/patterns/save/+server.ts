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
import { ZodError } from 'zod';

/**
 * POST /api/preceptors/[id]/patterns/save
 * Generate dates from patterns and save to preceptor_availability table
 */
export const POST: RequestHandler = async ({ params, request }) => {
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

		return successResponse({
			message: 'Availability dates saved successfully',
			saved_dates: savedCount
		});
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
