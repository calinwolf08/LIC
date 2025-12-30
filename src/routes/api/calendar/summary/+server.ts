/**
 * Calendar Summary API
 *
 * GET /api/calendar/summary - Get schedule statistics for a date range
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getScheduleSummary } from '$lib/features/schedules/services/calendar-service.js';
import { z, ZodError } from 'zod';
import { dateStringSchema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:calendar:summary');

/**
 * Schema for summary query parameters
 */
const summaryQuerySchema = z.object({
	start_date: dateStringSchema,
	end_date: dateStringSchema
});

/**
 * GET /api/calendar/summary
 * Returns schedule summary statistics for the specified date range
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 */
export const GET: RequestHandler = async ({ url }) => {
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');

	log.debug('Fetching calendar summary', { startDate, endDate });

	try {
		// Validate query parameters
		const params = summaryQuerySchema.parse({
			start_date: startDate,
			end_date: endDate
		});

		const summary = await getScheduleSummary(db, params.start_date, params.end_date);

		log.info('Calendar summary fetched', {
			startDate: params.start_date,
			endDate: params.end_date,
			totalStudents: summary.active_students,
			totalPreceptors: summary.active_preceptors,
			totalAssignments: summary.total_assignments
		});

		return successResponse(summary);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Calendar summary validation failed', {
				startDate,
				endDate,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch calendar summary', { startDate, endDate, error });
		return handleApiError(error);
	}
};
