/**
 * Fallbacks API - Collection Endpoints
 *
 * GET /api/scheduling-config/fallbacks - List fallbacks (filtered by preceptor)
 * POST /api/scheduling-config/fallbacks - Create new fallback
 */

import type { RequestHandler } from './$types';
import { requireAutogen } from '$lib/server/entitlements';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { FallbackService } from '$lib/features/scheduling-config/services/fallbacks.service';
import { preceptorFallbackInputSchema } from '$lib/features/scheduling-config/schemas/teams.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:fallbacks');
const service = new FallbackService(db);

/**
 * GET /api/scheduling-config/fallbacks
 * Returns fallbacks for a preceptor
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	requireAutogen(locals);
	const preceptorId = url.searchParams.get('preceptorId');

	log.debug('Fetching fallback chain', { preceptorId: preceptorId || 'none' });

	try {
		if (!preceptorId) {
			log.warn('Missing preceptorId parameter');
			return errorResponse('preceptorId query parameter is required', 400);
		}

		// Tenant boundary: the preceptor must be in the caller's schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', preceptorId);

		const result = await service.getFallbackChain(preceptorId);

		if (!result.success) {
			log.warn('Failed to fetch fallback chain', {
				preceptorId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Fallback chain fetched', {
			preceptorId,
			chainLength: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch fallback chain', { preceptorId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/fallbacks
 * Creates a new fallback
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireAutogen(locals);
	log.debug('Creating fallback');

	try {
		const body = await request.json();
		const validatedData = preceptorFallbackInputSchema.parse(body);

		// Tenant boundary: both preceptors in the fallback must be in the schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', validatedData.primaryPreceptorId);
		await assertEntityInSchedule(db, scheduleId, 'preceptor', validatedData.fallbackPreceptorId);

		const result = await service.createFallback(validatedData);

		if (!result.success) {
			log.warn('Failed to create fallback', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Fallback created', {
			id: result.data.id,
			primaryPreceptorId: result.data.primaryPreceptorId,
			fallbackPreceptorId: result.data.fallbackPreceptorId,
			priority: result.data.priority
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Fallback validation failed', {
				errors: error.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create fallback', { error });
		return handleApiError(error);
	}
};
