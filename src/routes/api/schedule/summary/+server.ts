/**
 * Schedule Summary API
 *
 * GET /api/schedule/summary - Get overall schedule results summary
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, handleApiError } from '$lib/api';
import { getScheduleSummaryData } from '$lib/features/schedules/services/schedule-views-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedule-summary');

/**
 * GET /api/schedule/summary
 * Returns overall schedule statistics and students with unmet requirements
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching schedule summary');

	try {
		const summary = await getScheduleSummaryData(db);

		log.info('Schedule summary fetched', {
			totalAssignments: summary.stats.totalAssignments,
			studentsWithUnmetRequirements: summary.studentsWithUnmetRequirements.length,
			isComplete: summary.isComplete
		});

		return successResponse(summary);
	} catch (error) {
		log.error('Failed to fetch schedule summary', { error });
		return handleApiError(error);
	}
};
