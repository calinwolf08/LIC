/**
 * Requirements API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/requirements/[id] - Get single requirement
 * PUT /api/scheduling-config/requirements/[id] - Update requirement
 * DELETE /api/scheduling-config/requirements/[id] - Delete requirement
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { RequirementService } from '$lib/features/scheduling-config/services/requirements.service';
import { requirementInputSchema } from '$lib/features/scheduling-config/schemas/requirements.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:requirements:id');
const service = new RequirementService(db);

/**
 * GET /api/scheduling-config/requirements/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching requirement', { id: params.id });

	try {
		const result = await service.getRequirement(params.id);

		if (!result.success || !result.data) {
			log.warn('Requirement not found', { id: params.id });
			return notFoundResponse('Requirement');
		}

		// Requirements are deprecated - this will always return null
		log.info('Requirement fetched (deprecated)', { id: params.id });

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch requirement', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/requirements/[id]
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Updating requirement', { id: params.id });

	try {
		const body = await request.json();
		const validatedData = requirementInputSchema.parse(body);

		const result = await service.updateRequirement(params.id, validatedData);

		if (!result.success) {
			// Include validation details if available
			if (result.error.details) {
				log.warn('Requirement update failed with validation details', {
					id: params.id,
					error: result.error.message,
					details: result.error.details
				});
				return errorResponse(`${result.error.message}: ${JSON.stringify(result.error.details)}`, 400);
			}
			log.warn('Failed to update requirement', { id: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		// Requirements are deprecated - this should not be reached
		log.info('Requirement updated (deprecated)', { id: params.id });

		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Requirement update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to update requirement', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/requirements/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting requirement', { id: params.id });

	try {
		const result = await service.deleteRequirement(params.id);

		if (!result.success) {
			log.warn('Failed to delete requirement', { id: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Requirement deleted', { id: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete requirement', { id: params.id, error });
		return handleApiError(error);
	}
};
