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
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:user:active-schedule');

const setActiveScheduleSchema = z.object({
	scheduleId: z.string().min(1)
});

/**
 * GET /api/user/active-schedule
 * Returns the current user's active schedule
 */
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	log.debug('Fetching active schedule', { userId });

	try {
		const session = locals.session;

		if (!session?.user?.id) {
			log.warn('Unauthorized active schedule request');
			return errorResponse('Unauthorized', 401);
		}

		const user = await db
			.selectFrom('user')
			.select(['id', 'active_schedule_id'])
			.where('id', '=', session.user.id)
			.executeTakeFirst();

		if (!user) {
			log.warn('User not found for active schedule', { userId });
			return errorResponse('User not found', 404);
		}

		if (!user.active_schedule_id) {
			log.info('No active schedule set', { userId });
			return successResponse({ schedule: null });
		}

		const schedule = await db
			.selectFrom('scheduling_periods')
			.selectAll()
			.where('id', '=', user.active_schedule_id)
			.executeTakeFirst();

		log.info('Active schedule fetched', {
			userId,
			scheduleId: user.active_schedule_id,
			scheduleName: schedule?.name
		});

		return successResponse({ schedule: schedule || null });
	} catch (error) {
		log.error('Failed to fetch active schedule', { userId, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/user/active-schedule
 * Sets the current user's active schedule
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	const userId = locals.session?.user?.id;
	log.debug('Setting active schedule', { userId });

	try {
		const session = locals.session;

		if (!session?.user?.id) {
			log.warn('Unauthorized set active schedule request');
			return errorResponse('Unauthorized', 401);
		}

		const body = await request.json();
		const { scheduleId } = setActiveScheduleSchema.parse(body);

		log.debug('Verifying schedule access', { userId, scheduleId });

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
			log.warn('Schedule not found or not accessible', { userId, scheduleId });
			return errorResponse('Schedule not found or not accessible', 404);
		}

		// Update user's active schedule
		await db
			.updateTable('user')
			.set({ active_schedule_id: scheduleId })
			.where('id', '=', session.user.id)
			.execute();

		log.info('Active schedule set', {
			userId,
			scheduleId,
			scheduleName: schedule.name
		});

		return successResponse({ schedule });
	} catch (error) {
		log.error('Failed to set active schedule', { userId, error });
		return handleApiError(error);
	}
};
