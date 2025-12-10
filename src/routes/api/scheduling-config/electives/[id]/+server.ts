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
import { ZodError } from 'zod';

const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives/[id]
 * Optional query param: details=true for full details including sites/preceptors
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const includeDetails = url.searchParams.get('details') === 'true';

		if (includeDetails) {
			const result = await service.getElectiveWithDetails(params.id);

			if (!result.success || !result.data) {
				return notFoundResponse('Elective');
			}

			return successResponse(result.data);
		}

		const result = await service.getElective(params.id);

		if (!result.success || !result.data) {
			return notFoundResponse('Elective');
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PATCH /api/scheduling-config/electives/[id]
 * Updates an elective
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const validatedData = clerkshipElectiveUpdateSchema.parse(body);

		const result = await service.updateElective(params.id, validatedData);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse('Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const result = await service.deleteElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse('Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
