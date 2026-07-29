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
import { assertScheduleOwnedByUser } from '$lib/api/schedule-context';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods:duplicate');

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
export const POST: RequestHandler = async ({ params, request, locals }) => {
	log.debug('Duplicating scheduling period', { sourceScheduleId: params.id });

	try {
		const sourceScheduleId = cuid2Schema.parse(params.id);

		// Ownership guard: only the owner may duplicate their schedule (otherwise
		// a user could clone another tenant's schedule and its entities).
		const userId = locals.session?.user?.id;
		if (!userId) return errorResponse('Authentication required', 401);
		await assertScheduleOwnedByUser(db, userId, sourceScheduleId);

		// Verify source schedule exists
		const sourceSchedule = await getSchedulingPeriodById(db, sourceScheduleId);
		if (!sourceSchedule) {
			log.warn('Source schedule not found for duplication', { sourceScheduleId });
			return errorResponse('Source schedule not found', 404);
		}

		// Parse and validate request body
		const body = await request.json();
		const validatedData = duplicateScheduleSchema.parse(body);

		log.debug('Starting schedule duplication', {
			sourceScheduleId,
			targetName: validatedData.name,
			startDate: validatedData.startDate,
			endDate: validatedData.endDate,
			year: validatedData.year
		});

		// Perform duplication
		const result = await duplicateToNewSchedule(
			db,
			sourceScheduleId,
			validatedData.name,
			validatedData.startDate,
			validatedData.endDate,
			validatedData.year,
			validatedData.options,
			locals.session?.user?.id ?? null
		);

		log.info('Schedule duplicated successfully', {
			sourceScheduleId,
			newScheduleId: result.schedule.id,
			name: validatedData.name,
			entityCounts: result.entityCounts
		});

		return successResponse({
			schedule: result.schedule,
			entityCounts: result.entityCounts,
			message: `Schedule "${validatedData.name}" created successfully`
		}, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Schedule duplication validation failed', {
				sourceScheduleId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Schedule duplication failed - not found', {
				sourceScheduleId: params.id,
				error: error.message
			});
			return errorResponse(error.message, 404);
		}

		log.error('Failed to duplicate schedule', { sourceScheduleId: params.id, error });
		return handleApiError(error);
	}
};
