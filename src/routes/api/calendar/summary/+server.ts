/**
 * Calendar Summary API
 *
 * GET /api/calendar/summary - Get schedule statistics for a date range
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, handleApiError } from '$lib/api/responses';
import { getScheduleSummary } from '$lib/features/schedules/services/calendar-service';
import { z, ZodError } from 'zod';
import { dateStringSchema } from '$lib/validation/common-schemas';

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
	try {
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		// Validate query parameters
		const params = summaryQuerySchema.parse({
			start_date: startDate,
			end_date: endDate
		});

		const summary = await getScheduleSummary(db, params.start_date, params.end_date);

		return successResponse(summary);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
