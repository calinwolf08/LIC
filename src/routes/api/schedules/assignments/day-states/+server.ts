/**
 * GET /api/schedules/assignments/day-states (Step 17)
 *
 * ?preceptorId&studentId&siteId&from&to — one classified entry per date so the
 * date picker can render a whole month without a round trip per day.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getDayStates } from '$lib/features/scheduling/services/assignment-day-state';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-assignments-day-states');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	if (!from || !DATE.test(from) || !to || !DATE.test(to)) {
		return errorResponse('from and to are required (YYYY-MM-DD)', 400);
	}

	// Edit mode passes the assignment being edited so it is not counted against
	// itself. Validate it as an id when present; absent means create mode.
	const rawExcludeId = url.searchParams.get('excludeId');
	let excludeId: string | null = null;
	if (rawExcludeId) {
		const parsed = cuid2Schema.safeParse(rawExcludeId);
		if (!parsed.success) return errorResponse('excludeId must be a valid id', 400);
		excludeId = parsed.data;
	}

	try {
		const days = await getDayStates(db, scheduleId, {
			preceptorId: url.searchParams.get('preceptorId'),
			studentId: url.searchParams.get('studentId'),
			siteId: url.searchParams.get('siteId'),
			from,
			to,
			excludeId
		});
		return successResponse({ days });
	} catch (err) {
		log.error('Failed to compute day states', { error: err });
		return errorResponse('Failed to load day states', 500);
	}
};
