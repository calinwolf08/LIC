/**
 * Elective Preceptors API - Association Endpoints
 *
 * GET /api/scheduling-config/electives/[id]/preceptors - Get preceptors for elective
 * POST /api/scheduling-config/electives/[id]/preceptors - Add preceptor to elective
 * PUT /api/scheduling-config/electives/[id]/preceptors - Set all preceptors for elective
 * DELETE /api/scheduling-config/electives/[id]/preceptors?preceptorId=xxx - Remove preceptor from elective
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
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:electives:preceptors');
const service = new ElectiveService(db);

const addPreceptorSchema = z.object({
	preceptorId: z.string().min(1, 'Preceptor ID is required'),
});

const setPreceptorsSchema = z.object({
	preceptorIds: z.array(z.string()),
});

/**
 * GET /api/scheduling-config/electives/[id]/preceptors
 * Returns preceptors associated with an elective
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching preceptors for elective', { electiveId: params.id });

	try {
		const result = await service.getPreceptorsForElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Elective not found', { electiveId: params.id });
				return notFoundResponse('Elective');
			}
			log.warn('Failed to fetch preceptors for elective', {
				electiveId: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Preceptors for elective fetched', {
			electiveId: params.id,
			preceptorCount: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch preceptors for elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives/[id]/preceptors
 * Adds a preceptor to an elective
 */
export const POST: RequestHandler = async ({ params, request }) => {
	log.debug('Adding preceptor to elective', { electiveId: params.id });

	try {
		const body = await request.json();
		const { preceptorId } = addPreceptorSchema.parse(body);

		const result = await service.addPreceptorToElective(params.id, preceptorId);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Preceptor or elective not found', { electiveId: params.id, preceptorId });
				return notFoundResponse(result.error.message.includes('Preceptor') ? 'Preceptor' : 'Elective');
			}
			log.warn('Failed to add preceptor to elective', {
				electiveId: params.id,
				preceptorId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Preceptor added to elective', { electiveId: params.id, preceptorId });
		return successResponse({ added: true }, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Preceptor addition validation failed', {
				electiveId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to add preceptor to elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/electives/[id]/preceptors
 * Sets all preceptors for an elective (replaces existing)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Setting preceptors for elective', { electiveId: params.id });

	try {
		const body = await request.json();
		const { preceptorIds } = setPreceptorsSchema.parse(body);

		const result = await service.setPreceptorsForElective(params.id, preceptorIds);

		if (!result.success) {
			log.warn('Failed to set preceptors for elective', {
				electiveId: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Preceptors set for elective', {
			electiveId: params.id,
			preceptorCount: preceptorIds.length
		});

		return successResponse({ updated: true });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Preceptor set validation failed', {
				electiveId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to set preceptors for elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]/preceptors?preceptorId=xxx
 * Removes a preceptor from an elective
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const preceptorId = url.searchParams.get('preceptorId');

	log.debug('Removing preceptor from elective', { electiveId: params.id, preceptorId });

	try {
		if (!preceptorId) {
			log.warn('Missing preceptorId parameter for preceptor removal', { electiveId: params.id });
			return errorResponse('preceptorId query parameter is required', 400);
		}

		const result = await service.removePreceptorFromElective(params.id, preceptorId);

		if (!result.success) {
			log.warn('Failed to remove preceptor from elective', {
				electiveId: params.id,
				preceptorId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Preceptor removed from elective', { electiveId: params.id, preceptorId });
		return successResponse({ removed: true });
	} catch (error) {
		log.error('Failed to remove preceptor from elective', { electiveId: params.id, preceptorId, error });
		return handleApiError(error);
	}
};
