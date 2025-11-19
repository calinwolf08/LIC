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
import { ZodError } from 'zod';

const service = new RequirementService(db);

/**
 * GET /api/scheduling-config/requirements
 * Returns requirements for a clerkship
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkshipId');

		if (!clerkshipId) {
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const result = await service.getRequirementsByClerkship(clerkshipId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/requirements
 * Creates a new requirement
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = requirementInputSchema.parse(body);

		const result = await service.createRequirement(validatedData);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
