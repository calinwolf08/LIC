/**
 * GET /api/schedules/checklist
 * Setup readiness checklist for the active schedule.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getSetupChecklist } from '$lib/features/scheduling/services/readiness';
import { hasAutogen } from '$lib/server/entitlements';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-checklist');

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return successResponse([]);

	try {
		const items = await getSetupChecklist(db, scheduleId, hasAutogen(locals));
		return successResponse(items);
	} catch (err) {
		log.error('Failed to build setup checklist', { error: err });
		return errorResponse('Failed to build setup checklist', 500);
	}
};
