/**
 * Electives API - Collection Endpoints
 *
 * GET /api/scheduling-config/electives - List electives for a clerkship
 * POST /api/scheduling-config/electives - Create new elective
 *
 * Electives now link directly to clerkships (not through requirements).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { clerkshipElectiveInputSchema } from '$lib/features/scheduling-config/schemas/requirements.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:electives');
const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives
 * Returns electives for a clerkship
 * Query params:
 *   - clerkshipId: filter by clerkship (required)
 *   - required: 'true' | 'false' - filter by required status
 */
export const GET: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');
	const requiredFilter = url.searchParams.get('required');

	log.debug('Fetching electives', { clerkshipId, requiredFilter });

	try {
		if (!clerkshipId) {
			log.warn('Missing clerkshipId parameter');
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		let result;

		// Filter by required status if specified
		if (requiredFilter === 'true') {
			result = await service.getRequiredElectives(clerkshipId);
		} else if (requiredFilter === 'false') {
			result = await service.getOptionalElectives(clerkshipId);
		} else {
			result = await service.getElectivesByClerkship(clerkshipId);
		}

		if (!result.success) {
			log.warn('Failed to fetch electives', {
				error: result.error.message,
				clerkshipId
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Electives fetched', {
			count: result.data.length,
			clerkshipId,
			requiredFilter
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch electives', { clerkshipId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives
 * Creates a new elective for a clerkship
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');

	log.debug('Creating elective', { clerkshipId });

	try {
		if (!clerkshipId) {
			log.warn('Missing clerkshipId parameter');
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const body = await request.json();
		const validatedData = clerkshipElectiveInputSchema.parse(body);

		const result = await service.createElective(clerkshipId, validatedData);

		if (!result.success) {
			log.warn('Failed to create elective', {
				clerkshipId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Elective created', {
			id: result.data.id,
			clerkshipId,
			isRequired: result.data.isRequired
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Elective validation failed', {
				clerkshipId,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create elective', { clerkshipId, error });
		return handleApiError(error);
	}
};
