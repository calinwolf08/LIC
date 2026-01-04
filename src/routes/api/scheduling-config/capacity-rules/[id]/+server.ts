/**
 * Capacity Rules API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/capacity-rules/[id] - Get capacity rule by ID
 * PATCH /api/scheduling-config/capacity-rules/[id] - Update capacity rule
 * DELETE /api/scheduling-config/capacity-rules/[id] - Delete capacity rule
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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:capacity-rules:id');
const service = new CapacityRuleService(db);

/**
 * GET /api/scheduling-config/capacity-rules/[id]
 * Returns a specific capacity rule by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	log.debug('Fetching capacity rule', { id });

	try {
		const result = await service.getCapacityRule(id);

		if (!result.success) {
			log.warn('Failed to fetch capacity rule', { id, error: result.error.message });
			return errorResponse(result.error.message, 404);
		}

		log.info('Capacity rule fetched', { id });
		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch capacity rule', { id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/scheduling-config/capacity-rules/[id]
 * Updates a capacity rule
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	log.debug('Updating capacity rule', { id });

	try {
		const body = await request.json();

		const result = await service.updateCapacityRule(id, body);

		if (!result.success) {
			log.warn('Failed to update capacity rule', { id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Capacity rule updated', { id });
		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Capacity rule update validation failed', {
				id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to update capacity rule', { id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/capacity-rules/[id]
 * Deletes a capacity rule
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;

	log.debug('Deleting capacity rule', { id });

	try {
		const result = await service.deleteCapacityRule(id);

		if (!result.success) {
			log.warn('Failed to delete capacity rule', { id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Capacity rule deleted', { id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete capacity rule', { id, error });
		return handleApiError(error);
	}
};
