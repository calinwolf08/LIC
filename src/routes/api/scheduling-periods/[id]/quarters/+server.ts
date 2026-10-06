/**
 * Schedule Quarters API (client feedback M4)
 *
 * GET /api/scheduling-periods/[id]/quarters  - list a schedule's quarters
 * PUT /api/scheduling-periods/[id]/quarters  - replace a schedule's quarters
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { assertScheduleOwnedByUser } from '$lib/api/schedule-context';
import { getSchedulingPeriodById } from '$lib/features/scheduling/services/scheduling-period-service';
import {
	getQuartersBySchedule,
	replaceQuarters
} from '$lib/features/schedules/services/quarter-service';
import { cuid2Schema, dateStringSchema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods:quarters');

const quartersSchema = z.object({
	quarters: z
		.array(
			z
				.object({
					name: z.string().min(1).max(100),
					start_date: dateStringSchema,
					end_date: dateStringSchema
				})
				.refine((q) => q.end_date >= q.start_date, {
					message: 'A quarter cannot end before it starts',
					path: ['end_date']
				})
		)
		.max(20)
});

async function ownedSchedule(params: { id: string }, locals: App.Locals): Promise<string> {
	const scheduleId = cuid2Schema.parse(params.id);
	const userId = locals.session?.user?.id;
	if (!userId) throw new Error('AUTH');
	await assertScheduleOwnedByUser(db, userId, scheduleId);
	const schedule = await getSchedulingPeriodById(db, scheduleId);
	if (!schedule) throw new Error('NOT_FOUND');
	return scheduleId;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const scheduleId = await ownedSchedule(params, locals);
		const quarters = await getQuartersBySchedule(db, scheduleId);
		return successResponse({ quarters });
	} catch (error) {
		if (error instanceof Error && error.message === 'AUTH')
			return errorResponse('Authentication required', 401);
		if (error instanceof Error && error.message === 'NOT_FOUND')
			return errorResponse('Schedule not found', 404);
		if (error instanceof ZodError) return validationErrorResponse(error);
		log.error('Failed to fetch quarters', { error });
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const scheduleId = await ownedSchedule(params, locals);
		const body = await request.json();
		const { quarters } = quartersSchema.parse(body);
		const saved = await replaceQuarters(db, scheduleId, quarters);
		log.info('Quarters replaced', { scheduleId, count: saved.length });
		return successResponse({ quarters: saved });
	} catch (error) {
		if (error instanceof Error && error.message === 'AUTH')
			return errorResponse('Authentication required', 401);
		if (error instanceof Error && error.message === 'NOT_FOUND')
			return errorResponse('Schedule not found', 404);
		if (error instanceof ZodError) return validationErrorResponse(error);
		log.error('Failed to save quarters', { error });
		return handleApiError(error);
	}
};
