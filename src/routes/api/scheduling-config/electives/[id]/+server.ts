/**
 * Electives API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/electives/[id] - Get single elective
 * GET /api/scheduling-config/electives/[id]?details=true - Get elective with sites/preceptors
 * PATCH /api/scheduling-config/electives/[id] - Update elective
 * DELETE /api/scheduling-config/electives/[id] - Delete elective
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse,
	validationErrorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { clerkshipElectiveUpdateSchema } from '$lib/features/scheduling-config/schemas/requirements.schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:electives:id');
const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives/[id]
 * Optional query param: details=true for full details including sites/preceptors
 */
export const GET: RequestHandler = async ({ params, url }) => {
	log.debug('Fetching elective', { id: params.id });

	try {
		const includeDetails = url.searchParams.get('details') === 'true';

		if (includeDetails) {
			log.debug('Fetching elective with details', { id: params.id });
			const result = await service.getElectiveWithDetails(params.id);

			if (!result.success || !result.data) {
				log.warn('Elective not found', { id: params.id });
				return notFoundResponse('Elective');
			}

			log.info('Elective with details fetched', {
				id: params.id,
				clerkshipId: result.data.clerkship_id,
				requirementType: result.data.requirement_type
			});

			return successResponse(result.data);
		}

		const result = await service.getElective(params.id);

		if (!result.success || !result.data) {
			log.warn('Elective not found', { id: params.id });
			return notFoundResponse('Elective');
		}

		log.info('Elective fetched', {
			id: params.id,
			clerkshipId: result.data.clerkship_id,
			requirementType: result.data.requirement_type
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch elective', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/scheduling-config/electives/[id]
 * Updates an elective
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating elective', { id: params.id });

	try {
		const body = await request.json();
		const validatedData = clerkshipElectiveUpdateSchema.parse(body);

		const result = await service.updateElective(params.id, validatedData);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Elective not found for update', { id: params.id });
				return notFoundResponse('Elective');
			}
			log.warn('Failed to update elective', { id: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Elective updated', {
			id: params.id,
			updatedFields: Object.keys(validatedData)
		});

		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Elective update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to update elective', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting elective', { id: params.id });

	try {
		const result = await service.deleteElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Elective not found for deletion', { id: params.id });
				return notFoundResponse('Elective');
			}
			log.warn('Failed to delete elective', { id: params.id, error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Elective deleted', { id: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete elective', { id: params.id, error });
		return handleApiError(error);
	}
};
