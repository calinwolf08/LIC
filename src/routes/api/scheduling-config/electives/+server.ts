/**
 * Electives API - Collection Endpoints
 *
 * GET /api/scheduling-config/electives - List electives (filtered by requirement or clerkship)
 * POST /api/scheduling-config/electives - Create new elective
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
import { ZodError } from 'zod';

const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives
 * Returns electives for a requirement or clerkship
 * Query params:
 *   - requirementId: filter by requirement
 *   - clerkshipId: filter by clerkship (across all requirements)
 *   - required: 'true' | 'false' - filter by required status
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const requirementId = url.searchParams.get('requirementId');
		const clerkshipId = url.searchParams.get('clerkshipId');
		const requiredFilter = url.searchParams.get('required');

		// Must provide either requirementId or clerkshipId
		if (!requirementId && !clerkshipId) {
			return errorResponse('Either requirementId or clerkshipId query parameter is required', 400);
		}

		let result;

		if (requirementId) {
			// Filter by required status if specified
			if (requiredFilter === 'true') {
				result = await service.getRequiredElectives(requirementId);
			} else if (requiredFilter === 'false') {
				result = await service.getOptionalElectives(requirementId);
			} else {
				result = await service.getElectivesByRequirement(requirementId);
			}
		} else if (clerkshipId) {
			result = await service.getElectivesByClerkship(clerkshipId);
		}

		if (!result || !result.success) {
			return errorResponse(result?.error?.message || 'Failed to fetch electives', 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives
 * Creates a new elective
 */
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const requirementId = url.searchParams.get('requirementId');

		if (!requirementId) {
			return errorResponse('requirementId query parameter is required', 400);
		}

		const body = await request.json();
		const validatedData = clerkshipElectiveInputSchema.parse(body);

		const result = await service.createElective(requirementId, validatedData);

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
