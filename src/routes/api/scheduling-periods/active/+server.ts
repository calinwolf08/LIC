/**
 * Active Scheduling Period API
 *
 * GET /api/scheduling-periods/active - Get the currently active scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getActiveSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';

/**
 * GET /api/scheduling-periods/active
 * Returns the currently active scheduling period
 */
export const GET: RequestHandler = async () => {
	try {
		const period = await getActiveSchedulingPeriod(db);

		if (!period) {
			return errorResponse('No active scheduling period found', 404);
		}

		return successResponse(period);
	} catch (error) {
		return handleApiError(error);
	}
};
