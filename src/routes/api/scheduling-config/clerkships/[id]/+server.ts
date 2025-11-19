/**
 * Clerkship Configuration API
 *
 * GET /api/scheduling-config/clerkships/[id] - Get complete configuration for a clerkship
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ConfigurationService } from '$lib/features/scheduling-config/services/configuration.service';

const service = new ConfigurationService(db);

/**
 * GET /api/scheduling-config/clerkships/[id]
 * Returns complete configuration for a clerkship including:
 * - All requirements (outpatient, inpatient, elective)
 * - Resolved configuration for each requirement
 * - Teams assigned to each requirement
 * - Electives for elective requirements
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getCompleteConfiguration(params.id);

		if (!result.success || !result.data) {
			return notFoundResponse('Clerkship configuration');
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};
