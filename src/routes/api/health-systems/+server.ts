/**
 * Health Systems API - Collection Endpoints
 *
 * GET /api/health-systems - List all health systems
 * POST /api/health-systems - Create new health system
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { healthSystemInputSchema } from '$lib/features/scheduling-config/schemas/health-systems.schemas';
import { autoAssociateWithActiveSchedule, getActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:health-systems');
const service = new HealthSystemService(db);

/**
 * GET /api/health-systems
 * Returns health systems for user's active schedule
 */
export const GET: RequestHandler = async ({ locals }) => {
	log.debug('Fetching health systems for user schedule');

	try {
		const userId = locals.session?.user?.id;
		if (!userId) {
			log.warn('No user session found');
			return errorResponse('Authentication required', 401);
		}

		const scheduleId = await getActiveScheduleId(userId);
		if (!scheduleId) {
			log.warn('No active schedule for user', { userId });
			return errorResponse('No active schedule. Please create or select a schedule first.', 400);
		}

		const result = await service.listHealthSystemsBySchedule(scheduleId);

		if (!result.success) {
			log.warn('Failed to list health systems', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		log.info('Health systems fetched', { count: result.data.length, scheduleId });
		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch health systems', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/health-systems
 * Creates a new health system and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating health system');

	try {
		const body = await request.json();
		const validatedData = healthSystemInputSchema.parse(body);

		const result = await service.createHealthSystem(validatedData);

		if (!result.success) {
			log.warn('Failed to create health system', { error: result.error.message });
			return errorResponse(result.error.message, 400);
		}

		// Auto-associate with user's active schedule
		if (result.data.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'health_system', result.data.id);
		}

		log.info('Health system created', {
			id: result.data.id,
			name: result.data.name,
			location: result.data.location
		});

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Health system validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to create health system', { error });
		return handleApiError(error);
	}
};
