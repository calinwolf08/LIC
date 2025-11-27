/**
 * Calendar API - Collection Endpoints
 *
 * GET /api/calendar - Get calendar events with filters
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, validationErrorResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getCalendarEvents } from '$lib/features/schedules/services/calendar-service.js';
import { z, ZodError } from 'zod';
import { dateStringSchema, cuid2Schema } from '$lib/validation/common-schemas';

/**
 * Schema for calendar query parameters
 */
const calendarQuerySchema = z.object({
	start_date: dateStringSchema,
	end_date: dateStringSchema,
	student_id: cuid2Schema.optional(),
	preceptor_id: cuid2Schema.optional(),
	clerkship_id: cuid2Schema.optional()
});

/**
 * GET /api/calendar
 * Returns calendar events for the specified date range and filters
 * Query params:
 *   - start_date: YYYY-MM-DD (required)
 *   - end_date: YYYY-MM-DD (required)
 *   - student_id: UUID (optional)
 *   - preceptor_id: UUID (optional)
 *   - clerkship_id: UUID (optional)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');
		const studentId = url.searchParams.get('student_id');
		const preceptorId = url.searchParams.get('preceptor_id');
		const clerkshipId = url.searchParams.get('clerkship_id');

		// Validate query parameters
		const filters = calendarQuerySchema.parse({
			start_date: startDate,
			end_date: endDate,
			student_id: studentId || undefined,
			preceptor_id: preceptorId || undefined,
			clerkship_id: clerkshipId || undefined
		});

		// Validate date range order
		if (filters.start_date > filters.end_date) {
			return errorResponse('end_date must be greater than or equal to start_date', 400);
		}

		const events = await getCalendarEvents(db, filters);

		return successResponse(events);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
