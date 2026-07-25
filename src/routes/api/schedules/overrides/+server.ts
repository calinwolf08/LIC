/**
 * GET /api/schedules/overrides (Step 17)
 *
 * Every assignment in the active schedule carrying an accepted override, for
 * the calendar's review list (Step 20).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { listOverrides } from '$lib/features/schedules/services/assignment-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-overrides');

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	try {
		const overrides = await listOverrides(db, scheduleId);
		return successResponse({ overrides });
	} catch (err) {
		log.error('Failed to list overrides', { error: err });
		return errorResponse('Failed to load overrides', 500);
	}
};
