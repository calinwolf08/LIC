/**
 * GET /api/schedules/status
 * Requirement status (completed / scheduled / unscheduled per clerkship) for
 * every student in the active schedule. Powers the students list & detail.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getStudentStatuses } from '$lib/features/scheduling/services/requirement-status';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-status');

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return successResponse([]);

	try {
		const statuses = await getStudentStatuses(db, scheduleId);
		return successResponse(statuses);
	} catch (err) {
		log.error('Failed to compute student statuses', { error: err });
		return errorResponse('Failed to compute student statuses', 500);
	}
};
