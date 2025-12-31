/**
 * Requirements API - Collection Endpoints
 *
 * GET /api/scheduling-config/requirements - List requirements (filtered by clerkship)
 * POST /api/scheduling-config/requirements - Create new requirement
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { RequirementService } from '$lib/features/scheduling-config/services/requirements.service';
import { requirementInputSchema } from '$lib/features/scheduling-config/schemas/requirements.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:requirements');
const service = new RequirementService(db);

/**
 * GET /api/scheduling-config/requirements
 * Returns requirements for a clerkship
 */
export const GET: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');

	log.debug('Fetching requirements', { clerkshipId: clerkshipId || 'none' });

	try {
		if (!clerkshipId) {
			log.warn('Missing clerkshipId parameter');
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const result = await service.getRequirementsByClerkship(clerkshipId);

		if (!result.success) {
			log.warn('Failed to fetch requirements', {
				clerkshipId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Requirements fetched', {
			clerkshipId,
			count: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch requirements', { clerkshipId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/requirements
 * Creates a new requirement
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Creating requirement');

	try {
		const body = await request.json();
		const validatedData = requirementInputSchema.parse(body);

		const result = await service.createRequirement(validatedData);

		if (!result.success) {
			log.warn('Failed to create requirement', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Requirement created', {
			id: result.data.id,
			clerkshipId: result.data.clerkshipId,
			requirementType: result.data.requirementType
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Requirement validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create requirement', { error });
		return handleApiError(error);
	}
};
