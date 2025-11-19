/**
 * Fallbacks API - Collection Endpoints
 *
 * GET /api/scheduling-config/fallbacks - List fallbacks (filtered by preceptor)
 * POST /api/scheduling-config/fallbacks - Create new fallback
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';
import { preceptorFallbackInputSchema } from '$lib/features/scheduling-config/schemas/teams.schemas';
import { ZodError } from 'zod';

const service = new FallbackService(db);

/**
 * GET /api/scheduling-config/fallbacks
 * Returns fallbacks for a preceptor
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const preceptorId = url.searchParams.get('preceptorId');

		if (!preceptorId) {
			return errorResponse('preceptorId query parameter is required', 400);
		}

		const result = await service.getFallbackChain(preceptorId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/fallbacks
 * Creates a new fallback
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = preceptorFallbackInputSchema.parse(body);

		const result = await service.createFallback(validatedData);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
