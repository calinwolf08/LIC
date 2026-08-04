/**
 * Active Scheduling Period API
 *
 * GET /api/scheduling-periods/active - Get the currently active scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getActiveScheduleForUser } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-periods:active');

/**
 * GET /api/scheduling-periods/active
 * Returns the caller's active scheduling period (per-user, not the global flag).
 */
export const GET: RequestHandler = async ({ locals }) => {
	log.debug('Fetching active scheduling period');

	try {
		const userId = locals.session?.user?.id;
		if (!userId) {
			return errorResponse('Authentication required', 401);
		}

		const period = await getActiveScheduleForUser(db, userId);

		if (!period) {
			log.warn('No active scheduling period found', { userId });
			return errorResponse('No active scheduling period found', 404);
		}

		log.info('Active scheduling period fetched', {
			id: period.id,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		});

		return successResponse(period);
	} catch (error) {
		log.error('Failed to fetch active scheduling period', { error });
		return handleApiError(error);
	}
};
