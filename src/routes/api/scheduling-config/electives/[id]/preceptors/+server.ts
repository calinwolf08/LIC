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
import { z } from 'zod';
import { ZodError } from 'zod';

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
	try {
		const result = await service.getPreceptorsForElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse('Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives/[id]/preceptors
 * Adds a preceptor to an elective
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const { preceptorId } = addPreceptorSchema.parse(body);

		const result = await service.addPreceptorToElective(params.id, preceptorId);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse(result.error.message.includes('Preceptor') ? 'Preceptor' : 'Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ added: true }, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/electives/[id]/preceptors
 * Sets all preceptors for an elective (replaces existing)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const { preceptorIds } = setPreceptorsSchema.parse(body);

		const result = await service.setPreceptorsForElective(params.id, preceptorIds);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ updated: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]/preceptors?preceptorId=xxx
 * Removes a preceptor from an elective
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const preceptorId = url.searchParams.get('preceptorId');

		if (!preceptorId) {
			return errorResponse('preceptorId query parameter is required', 400);
		}

		const result = await service.removePreceptorFromElective(params.id, preceptorId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ removed: true });
	} catch (error) {
		return handleApiError(error);
	}
};
