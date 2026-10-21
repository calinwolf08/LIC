/**
 * GET /api/schedules/plan/validate — the manual planner's dry run (L4).
 *
 * Evaluates the caller's draft pins layered on the committed active schedule with the
 * SAME rules as commit, returning the whole-schedule result (committed ∪ pins) plus a
 * per-pin summary so the UI can mark which pins would, or would not, commit, and
 * each student's requirement progress (saved + planned vs required).
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { evaluatePlan } from '$lib/features/schedules/services/plan-service';
import { getPlanProgress } from '$lib/features/schedules/services/plan-progress';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-plan-validate');

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
			counts: {},
			pins: [],
			pinStatus: {},
			committed: [],
			blackoutDates: [],
			progress: []
		});
	}

	try {
		const [plan, progress] = await Promise.all([
			evaluatePlan(db, scheduleId, userId),
			getPlanProgress(db, scheduleId, userId)
		]);
		return successResponse({ ...plan, progress });
	} catch (err) {
		log.error('Failed to evaluate plan', { error: err });
		return errorResponse('Failed to evaluate plan', 500);
	}
};
