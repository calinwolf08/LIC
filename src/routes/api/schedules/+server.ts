/**
 * Schedules API - Collection Endpoints
 *
 * DELETE /api/schedules - Clear all assignments
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, handleApiError } from '$lib/api/responses';
import { clearAllAssignments } from '$lib/features/schedules/services/editing-service';

/**
 * DELETE /api/schedules
 * Clears all schedule assignments (for regeneration)
 */
export const DELETE: RequestHandler = async () => {
	try {
		const deletedCount = await clearAllAssignments(db);

		return successResponse({ deleted_count: deletedCount });
	} catch (error) {
		return handleApiError(error);
	}
};
