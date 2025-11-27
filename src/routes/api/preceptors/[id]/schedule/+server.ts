/**
 * Preceptor Schedule API
 *
 * GET /api/preceptors/[id]/schedule - Get preceptor's schedule with capacity breakdown
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, notFoundResponse, handleApiError } from '$lib/api';
import { getPreceptorScheduleData } from '$lib/features/schedules/services/schedule-views-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:preceptor-schedule');

/**
 * GET /api/preceptors/[id]/schedule
 * Returns preceptor's complete schedule with availability and capacity
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching preceptor schedule', { preceptorId: params.id });

	try {
		const schedule = await getPreceptorScheduleData(db, params.id);

		if (!schedule) {
			log.warn('Preceptor not found', { preceptorId: params.id });
			return notFoundResponse('Preceptor');
		}

		log.info('Preceptor schedule fetched', {
			preceptorId: params.id,
			totalAssignments: schedule.assignments.length,
			utilizationPercent: schedule.overallCapacity.utilizationPercent
		});

		return successResponse(schedule);
	} catch (error) {
		log.error('Failed to fetch preceptor schedule', { preceptorId: params.id, error });
		return handleApiError(error);
	}
};
