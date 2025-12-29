/**
 * Capacity Rules API - Collection Endpoints
 *
 * GET /api/scheduling-config/capacity-rules - List capacity rules (filtered by preceptor)
 * POST /api/scheduling-config/capacity-rules - Create new capacity rule
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { CapacityRuleService } from '$lib/features/scheduling-config/services/capacity.service';
import { preceptorCapacityRuleInputSchema } from '$lib/features/scheduling-config/schemas/capacity.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:capacity-rules');
const service = new CapacityRuleService(db);

/**
 * GET /api/scheduling-config/capacity-rules
 * Returns capacity rules, optionally filtered by preceptor
 */
export const GET: RequestHandler = async ({ url }) => {
	const preceptorId = url.searchParams.get('preceptorId');

	log.debug('Fetching capacity rules', { preceptorId: preceptorId || 'none' });

	try {
		if (!preceptorId) {
			log.warn('Missing preceptorId parameter');
			return errorResponse('preceptorId query parameter is required', 400);
		}

		const result = await service.getCapacityRulesByPreceptor(preceptorId);

		if (!result.success) {
			log.warn('Failed to fetch capacity rules', {
				preceptorId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Capacity rules fetched', {
			preceptorId,
			count: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch capacity rules', { preceptorId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/capacity-rules
 * Creates a new capacity rule
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Creating capacity rule');

	try {
		const body = await request.json();
		const validatedData = preceptorCapacityRuleInputSchema.parse(body);

		const result = await service.createCapacityRule(validatedData);

		if (!result.success) {
			log.warn('Failed to create capacity rule', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Capacity rule created', {
			id: result.data.id,
			preceptorId: result.data.preceptor_id,
			maxConcurrent: result.data.max_concurrent_students
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Capacity rule validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create capacity rule', { error });
		return handleApiError(error);
	}
};
