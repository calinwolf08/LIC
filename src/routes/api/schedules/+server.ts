/**
 * Schedules API - Collection Endpoints
 *
 * DELETE /api/schedules - Clear all assignments (with optional date filter)
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { clearAllAssignments } from '$lib/features/schedules/services/editing-service.js';

/**
 * DELETE /api/schedules
 * Clears schedule assignments (for regeneration)
 *
 * Query parameters:
 * - fromDate (optional): Only clear assignments from this date forward (YYYY-MM-DD)
 *   If not provided, defaults to today (preserves past assignments)
 * - clearAll (optional): Set to 'true' to clear ALL assignments including past ones
 *
 * Examples:
 * - DELETE /api/schedules?fromDate=2025-12-01  (clear from Dec 1 onwards)
 * - DELETE /api/schedules?clearAll=true         (clear everything)
 * - DELETE /api/schedules                       (clear from today onwards)
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const clearAll = url.searchParams.get('clearAll') === 'true';
		const fromDate = url.searchParams.get('fromDate');

		let dateFilter: string | undefined;

		if (clearAll) {
			// Clear everything - no date filter
			dateFilter = undefined;
		} else if (fromDate) {
			// Clear from specified date
			dateFilter = fromDate;
		} else {
			// Default: clear from today onwards (preserve past)
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			dateFilter = today.toISOString().split('T')[0];
		}

		const deletedCount = await clearAllAssignments(db, dateFilter);

		return successResponse({
			deleted_count: deletedCount,
			from_date: dateFilter || 'all',
			preserved_past: !clearAll && !!dateFilter
		});
	} catch (error) {
		return handleApiError(error);
	}
};
