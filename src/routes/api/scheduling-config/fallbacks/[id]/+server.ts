/**
 * Fallbacks API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/fallbacks/[id] - Get single fallback
 * DELETE /api/scheduling-config/fallbacks/[id] - Delete fallback
 */

import type { RequestHandler } from './$types';
import { requireAutogen } from '$lib/server/entitlements';
import { db } from '$lib/db';
import { successResponse, errorResponse, notFoundResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertFallbackInSchedule } from '$lib/api/schedule-context';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:fallbacks:id');
const service = new FallbackService(db);

/**
 * GET /api/scheduling-config/fallbacks/[id]
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	requireAutogen(locals);
	log.debug('Fetching fallback', { id: params.id });

	try {
		// Tenant boundary: a fallback is owned via its primary preceptor.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertFallbackInSchedule(db, scheduleId, params.id);

		const result = await service.getFallback(params.id);

		if (!result.success || !result.data) {
			log.warn('Fallback not found', { id: params.id });
			return notFoundResponse('Fallback');
		}

		log.info('Fallback fetched', {
			id: params.id,
			primaryPreceptorId: result.data.primaryPreceptorId,
			fallbackPreceptorId: result.data.fallbackPreceptorId,
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
export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAutogen(locals);
	log.debug('Deleting fallback', { id: params.id });

	try {
		const scheduleId = await requireActiveScheduleId(locals);
		await assertFallbackInSchedule(db, scheduleId, params.id);

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
