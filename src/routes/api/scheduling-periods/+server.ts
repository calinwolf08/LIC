/**
 * Scheduling Periods API
 *
 * GET /api/scheduling-periods - Get scheduling periods for current user
 * POST /api/scheduling-periods - Create a new scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { auth } from '$lib/auth';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, ConflictError, handleApiError } from '$lib/api/errors';
import {
	createSchedulingPeriod
} from '$lib/features/scheduling/services/scheduling-period-service';
import { createSchedulingPeriodSchema } from '$lib/features/preceptors/pattern-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods');

/**
 * GET /api/scheduling-periods
 * Returns scheduling periods for the authenticated user only
 */
export const GET: RequestHandler = async ({ request }) => {
	log.debug('Fetching scheduling periods');

	try {
		// Require authentication
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			log.warn('Unauthorized access to scheduling periods');
			return errorResponse('Unauthorized', 401);
		}

		// Only return schedules owned by this user
		const periods = await db
			.selectFrom('scheduling_periods')
			.selectAll()
			.where('user_id', '=', session.user.id)
			.orderBy('start_date', 'desc')
			.execute();

		log.info('Scheduling periods fetched', { count: periods.length, userId: session.user.id });
		return successResponse(periods);
	} catch (error) {
		log.error('Failed to fetch scheduling periods', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-periods
 * Create a new scheduling period for the authenticated user
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Creating scheduling period');

	try {
		// Require authentication
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			log.warn('Unauthorized attempt to create scheduling period');
			return errorResponse('Unauthorized', 401);
		}

		// Parse and validate request body
		const body = await request.json();
		const validatedData = createSchedulingPeriodSchema.parse(body);

		// Add user_id to the data
		const dataWithUser = {
			...validatedData,
			user_id: session.user.id
		};

		const period = await createSchedulingPeriod(db, dataWithUser);

		log.info('Scheduling period created', {
			id: period.id,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date,
			userId: session.user.id
		});

		return successResponse(period, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Scheduling period validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Scheduling period conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to create scheduling period', { error });
		return handleApiError(error);
	}
};
