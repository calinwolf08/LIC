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
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules');

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
	const clearAll = url.searchParams.get('clearAll') === 'true';
	const fromDate = url.searchParams.get('fromDate');

	log.debug('Clearing assignments', { clearAll, fromDate });

	try {
		let dateFilter: string | undefined;

		if (clearAll) {
			// Clear everything - no date filter
			dateFilter = undefined;
			log.info('Clearing all assignments (no date filter)');
		} else if (fromDate) {
			// Clear from specified date
			dateFilter = fromDate;
			log.info('Clearing assignments from specified date', { fromDate });
		} else {
			// Default: clear from today onwards (preserve past)
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			dateFilter = today.toISOString().split('T')[0];
			log.info('Clearing assignments from today onwards', { fromDate: dateFilter });
		}

		const deletedCount = await clearAllAssignments(db, dateFilter);

		log.info('Assignments cleared', {
			deletedCount,
			fromDate: dateFilter || 'all',
			preservedPast: !clearAll && !!dateFilter
		});

		return successResponse({
			deleted_count: deletedCount,
			from_date: dateFilter || 'all',
			preserved_past: !clearAll && !!dateFilter
		});
	} catch (error) {
		log.error('Failed to clear assignments', { clearAll, fromDate, error });
		return handleApiError(error);
	}
};
