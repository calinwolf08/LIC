/**
 * Schedule Duplication API
 *
 * POST /api/scheduling-periods/[id]/duplicate - Duplicate a schedule with selected entities
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { getSchedulingPeriodById } from '$lib/features/scheduling/services/scheduling-period-service';
import { duplicateToNewSchedule } from '$lib/features/schedules/services/schedule-duplication.service';
import { duplicateScheduleSchema } from '$lib/features/preceptors/pattern-schemas';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { ZodError } from 'zod';

/**
 * POST /api/scheduling-periods/[id]/duplicate
 * Duplicate a schedule with selected entities
 *
 * Body:
 * {
 *   name: string,
 *   startDate: string (YYYY-MM-DD),
 *   endDate: string (YYYY-MM-DD),
 *   year: number,
 *   options?: {
 *     students?: string[] | 'all',
 *     preceptors?: string[] | 'all',
 *     sites?: string[] | 'all',
 *     healthSystems?: string[] | 'all',
 *     clerkships?: string[] | 'all',
 *     teams?: string[] | 'all',
 *     configurations?: string[] | 'all'
 *   }
 * }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const sourceScheduleId = cuid2Schema.parse(params.id);

		// Verify source schedule exists
		const sourceSchedule = await getSchedulingPeriodById(db, sourceScheduleId);
		if (!sourceSchedule) {
			return errorResponse('Source schedule not found', 404);
		}

		// Parse and validate request body
		const body = await request.json();
		const validatedData = duplicateScheduleSchema.parse(body);

		// Perform duplication
		const result = await duplicateToNewSchedule(
			db,
			sourceScheduleId,
			validatedData.name,
			validatedData.startDate,
			validatedData.endDate,
			validatedData.year,
			validatedData.options
		);

		return successResponse({
			schedule: result.schedule,
			entityCounts: result.entityCounts,
			message: `Schedule "${validatedData.name}" created successfully`
		}, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};
