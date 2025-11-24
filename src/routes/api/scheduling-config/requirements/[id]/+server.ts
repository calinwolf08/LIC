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
import { ZodError } from 'zod';

const service = new RequirementService(db);

/**
 * GET /api/scheduling-config/requirements/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getRequirement(params.id);

		if (!result.success || !result.data) {
			return notFoundResponse('Requirement');
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/requirements/[id]
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const validatedData = requirementInputSchema.parse(body);

		const result = await service.updateRequirement(params.id, validatedData);

		if (!result.success) {
			// Include validation details if available
			if (result.error.details) {
				return errorResponse(`${result.error.message}: ${JSON.stringify(result.error.details)}`, 400);
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
 * DELETE /api/scheduling-config/requirements/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const result = await service.deleteRequirement(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
