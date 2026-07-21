/**
 * GET /api/schedules/validation
 * Whole-schedule violations for the active schedule (calendar markers / dashboard).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { validateSchedule } from '$lib/features/scheduling/services/schedule-validation';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-validation');

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) {
		return successResponse({
			violations: [],
			byDate: {},
			byStudent: {},
			byPreceptor: {},
			counts: {}
		});
	}

	try {
		const result = await validateSchedule(db, scheduleId);
		return successResponse(result);
	} catch (err) {
		log.error('Failed to validate schedule', { error: err });
		return errorResponse('Failed to validate schedule', 500);
	}
};
