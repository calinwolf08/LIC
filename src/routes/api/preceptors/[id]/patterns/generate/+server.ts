/**
 * Pattern Date Generation API
 *
 * POST /api/preceptors/[id]/patterns/generate - Generate availability dates from patterns
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { generateDatesFromPatterns } from '$lib/features/preceptors/services/pattern-service';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { ZodError } from 'zod';

/**
 * POST /api/preceptors/[id]/patterns/generate
 * Generate availability dates from all enabled patterns
 * Returns preview without saving to database
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const result = await generateDatesFromPatterns(db, id);

		return successResponse(result);
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
