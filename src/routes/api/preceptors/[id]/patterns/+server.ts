/**
 * Preceptor Availability Patterns API
 *
 * GET /api/preceptors/[id]/patterns - Get all patterns for a preceptor
 * POST /api/preceptors/[id]/patterns - Create a new pattern
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
	getPatterns,
	createPattern
} from '$lib/features/preceptors/services/pattern-service';
import { createPatternSchema } from '$lib/features/preceptors/pattern-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors/[id]/patterns
 * Returns all patterns for a preceptor
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const patterns = await getPatterns(db, id);

		// Parse config JSON for each pattern
		const parsedPatterns = patterns.map(pattern => ({
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		}));

		return successResponse(parsedPatterns);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors/[id]/patterns
 * Create a new pattern for a preceptor
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = createPatternSchema.parse({
			preceptor_id: id,
			...body
		});

		const pattern = await createPattern(db, validatedData);

		// Parse config JSON
		const parsedPattern = {
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		};

		return successResponse(parsedPattern, 201);
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
