/**
 * Health Systems Dependencies API
 *
 * GET /api/health-systems/[id]/dependencies
 * Get dependency counts for a health system
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';

const service = new HealthSystemService(db);

/**
 * GET /api/health-systems/[id]/dependencies
 * Get dependency counts for a health system
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getHealthSystemDependencies(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};
