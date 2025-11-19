/**
 * Electives API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/electives/[id] - Get single elective
 * DELETE /api/scheduling-config/electives/[id] - Delete elective
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';

const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
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
 * DELETE /api/scheduling-config/electives/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const result = await service.deleteElective(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
