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
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:fallbacks:id');
const service = new FallbackService(db);

/**
 * GET /api/scheduling-config/fallbacks/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching fallback', { id: params.id });

	try {
		const result = await service.getFallback(params.id);

		if (!result.success || !result.data) {
			log.warn('Fallback not found', { id: params.id });
			return notFoundResponse('Fallback');
		}

		log.info('Fallback fetched', {
			id: params.id,
			primaryPreceptorId: result.data.primary_preceptor_id,
			fallbackPreceptorId: result.data.fallback_preceptor_id,
			priority: result.data.priority
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch fallback', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/fallbacks/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting fallback', { id: params.id });

	try {
		const result = await service.deleteFallback(params.id);

		if (!result.success) {
			log.warn('Failed to delete fallback', { id: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Fallback deleted', { id: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete fallback', { id: params.id, error });
		return handleApiError(error);
	}
};
