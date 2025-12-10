/**
 * User Active Schedule API
 *
 * GET /api/user/active-schedule - Get user's active schedule
 * PUT /api/user/active-schedule - Set user's active schedule
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { z } from 'zod';

const setActiveScheduleSchema = z.object({
	scheduleId: z.string().min(1)
});

/**
 * GET /api/user/active-schedule
 * Returns the current user's active schedule
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = locals.session;

		if (!session?.user?.id) {
			return errorResponse('Unauthorized', 401);
		}

		const user = await db
			.selectFrom('user')
			.select(['id', 'active_schedule_id'])
			.where('id', '=', session.user.id)
			.executeTakeFirst();

		if (!user) {
			return errorResponse('User not found', 404);
		}

		if (!user.active_schedule_id) {
			return successResponse({ schedule: null });
		}

		const schedule = await db
			.selectFrom('scheduling_periods')
			.selectAll()
			.where('id', '=', user.active_schedule_id)
			.executeTakeFirst();

		return successResponse({ schedule: schedule || null });
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PUT /api/user/active-schedule
 * Sets the current user's active schedule
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	try {
		const session = locals.session;

		if (!session?.user?.id) {
			return errorResponse('Unauthorized', 401);
		}

		const body = await request.json();
		const { scheduleId } = setActiveScheduleSchema.parse(body);

		// Verify the schedule exists and belongs to the user (or is accessible)
		const schedule = await db
			.selectFrom('scheduling_periods')
			.selectAll()
			.where('id', '=', scheduleId)
			.where((eb) =>
				eb.or([
					eb('user_id', '=', session.user.id),
					eb('user_id', 'is', null) // Legacy schedules without user ownership
				])
			)
			.executeTakeFirst();

		if (!schedule) {
			return errorResponse('Schedule not found or not accessible', 404);
		}

		// Update user's active schedule
		await db
			.updateTable('user')
			.set({ active_schedule_id: scheduleId })
			.where('id', '=', session.user.id)
			.execute();

		return successResponse({ schedule });
	} catch (error) {
		return handleApiError(error);
	}
};
