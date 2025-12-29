/**
 * Active Scheduling Period API
 *
 * GET /api/scheduling-periods/active - Get the currently active scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getActiveSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-periods:active');

/**
 * GET /api/scheduling-periods/active
 * Returns the currently active scheduling period
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching active scheduling period');

	try {
		const period = await getActiveSchedulingPeriod(db);

		if (!period) {
			log.warn('No active scheduling period found');
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
