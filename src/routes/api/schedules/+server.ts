/**
 * Schedules API - Collection Endpoints
 *
 * DELETE /api/schedules - Clear the active schedule's assignments (regeneration).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { clearAllAssignments } from '$lib/features/schedules/services/editing-service.js';
import { requireActiveScheduleId } from '$lib/api/schedule-context';
import { requireAutogen } from '$lib/server/entitlements';
import { getTodayUTC } from '$lib/features/scheduling/utils/date-utils';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules');

/**
 * DELETE /api/schedules
 * Clears the caller's active-schedule assignments (used by the Stage 2
 * "Full regeneration" flow). Gated by `requireAutogen` and scoped to the
 * active schedule — a Stage 1 user could previously wipe every tenant's
 * unlocked assignments (review finding F-04). Locked rows are always kept.
 *
 * Query parameters:
 * - fromDate (optional): only clear assignments on or after this date (YYYY-MM-DD).
 *   Default: today (preserves past assignments).
 * - clearAll (optional): 'true' to clear all dates including the past.
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
	requireAutogen(locals);
	const scheduleId = await requireActiveScheduleId(locals);

	const clearAll = url.searchParams.get('clearAll') === 'true';
	const fromDate = url.searchParams.get('fromDate');

	log.debug('Clearing assignments', { scheduleId, clearAll, fromDate });

	try {
		let dateFilter: string | undefined;

		if (clearAll) {
			dateFilter = undefined;
		} else if (fromDate) {
			dateFilter = fromDate;
		} else {
			dateFilter = getTodayUTC();
		}

		const deletedCount = await clearAllAssignments(db, scheduleId, dateFilter);

		log.info('Assignments cleared', {
			scheduleId,
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
		log.error('Failed to clear assignments', { scheduleId, clearAll, fromDate, error });
		return handleApiError(error);
	}
};
