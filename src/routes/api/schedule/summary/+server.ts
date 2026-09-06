/**
 * Schedule Summary API
 *
 * GET /api/schedule/summary - Get overall schedule results summary
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, handleApiError } from '$lib/api';
import { getScheduleSummaryData } from '$lib/features/schedules/services/schedule-views-service';
import { getLatestGenerationRun } from '$lib/features/scheduling/services/audit-service';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedule-summary');

/**
 * GET /api/schedule/summary
 * Returns overall schedule statistics and students with unmet requirements
 */
export const GET: RequestHandler = async ({ locals }) => {
	log.debug('Fetching schedule summary');

	try {
		const scheduleId = locals.session?.user?.id
			? await getActiveScheduleId(locals.session.user.id)
			: null;
		const summary = await getScheduleSummaryData(db, scheduleId);

		// The last generation run carries the engine's own violations, unmet
		// requirements and statistics, so the Results page can render them after a
		// run instead of losing them (review finding F-25).
		const lastRun = scheduleId ? await getLatestGenerationRun(db, scheduleId) : null;

		log.info('Schedule summary fetched', {
			totalAssignments: summary.stats.totalAssignments,
			studentsWithUnmetRequirements: summary.studentsWithUnmetRequirements.length,
			isComplete: summary.isComplete,
			hasLastRun: !!lastRun
		});

		return successResponse({ ...summary, lastRun });
	} catch (error) {
		log.error('Failed to fetch schedule summary', { error });
		return handleApiError(error);
	}
};
