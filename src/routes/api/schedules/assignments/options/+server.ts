/**
 * GET /api/schedules/assignments/options (Step 17)
 *
 * Cascading eligibility for the assignment dialog. Any subset of
 * ?studentId&clerkshipId&preceptorId&siteId narrows the annotations; options
 * that do not fit come back with `eligible: false` and a reason rather than
 * being hidden.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getEligibleOptions } from '$lib/features/scheduling/services/assignment-eligibility';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-assignments-options');

export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	try {
		const options = await getEligibleOptions(db, scheduleId, {
			studentId: url.searchParams.get('studentId'),
			clerkshipId: url.searchParams.get('clerkshipId'),
			preceptorId: url.searchParams.get('preceptorId'),
			siteId: url.searchParams.get('siteId')
		});
		return successResponse(options);
	} catch (err) {
		log.error('Failed to compute assignment options', { error: err });
		return errorResponse('Failed to load options', 500);
	}
};
