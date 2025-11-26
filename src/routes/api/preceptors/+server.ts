/**
 * Preceptors API - Collection Endpoints
 *
 * GET /api/preceptors - List all preceptors
 * POST /api/preceptors - Create new preceptor
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { ConflictError, handleApiError } from '$lib/api/errors';
import {
	getPreceptors,
	createPreceptor
} from '$lib/features/preceptors/services/preceptor-service.js';
import { createPreceptorSchema } from '$lib/features/preceptors/schemas.js';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors
 * Returns all preceptors
 */
export const GET: RequestHandler = async () => {
	try {
		const preceptors = await getPreceptors(db);
		return successResponse(preceptors);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors
 * Creates a new preceptor
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = createPreceptorSchema.parse(body);

		const preceptor = await createPreceptor(db, validatedData);

		return successResponse(preceptor, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
