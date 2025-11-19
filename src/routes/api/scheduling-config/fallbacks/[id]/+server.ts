/**
 * Fallbacks API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/fallbacks/[id] - Get single fallback
 * DELETE /api/scheduling-config/fallbacks/[id] - Delete fallback
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';

const service = new FallbackService(db);

/**
 * GET /api/scheduling-config/fallbacks/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getFallback(params.id);

		if (!result.success || !result.data) {
			return notFoundResponse('Fallback');
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/fallbacks/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const result = await service.deleteFallback(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
