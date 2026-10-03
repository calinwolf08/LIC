/**
 * POST /api/schedules/plan/commit — turn the draft into real assignments (L4 #5).
 *
 * Every pin runs through the same validator as manual create. Committable pins
 * persist and leave the draft; the rest are reported back with the codes that
 * blocked them. Partial success is expected, not an error.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { commitPlan } from '$lib/features/schedules/services/plan-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-plan-commit');

export const POST: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	try {
		return successResponse(await commitPlan(db, scheduleId, userId));
	} catch (err) {
		log.error('Failed to commit plan', { error: err });
		return errorResponse('Failed to commit plan', 500);
	}
};
