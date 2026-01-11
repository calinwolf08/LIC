/**
 * Preceptors API - Collection Endpoints
 *
 * GET /api/preceptors - List preceptors for user's active schedule with associations
 * POST /api/preceptors - Create new preceptor
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { ConflictError, handleApiError } from '$lib/api/errors';
import {
	createPreceptor,
	getPreceptorsWithAssociationsBySchedule,
	setPreceptorSites
} from '$lib/features/preceptors/services/preceptor-service.js';
import { createPreceptorSchema } from '$lib/features/preceptors/schemas.js';
import { autoAssociateWithActiveSchedule, getActiveScheduleId } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors');

/**
 * GET /api/preceptors
 * Returns preceptors for user's active schedule with their associations
 */
export const GET: RequestHandler = async ({ locals }) => {
	log.debug('Fetching preceptors for user schedule');

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

		const preceptors = await getPreceptorsWithAssociationsBySchedule(db, scheduleId);

		log.info('Preceptors fetched', { count: preceptors.length, scheduleId });
		return successResponse(preceptors);
	} catch (error) {
		log.error('Failed to fetch preceptors', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors
 * Creates a new preceptor and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating preceptor');

	try {
		const body = await request.json();
		const validatedData = createPreceptorSchema.parse(body);

		const preceptor = await createPreceptor(db, validatedData);

		// Handle site_ids if provided (new multi-site support)
		if (validatedData.site_ids && validatedData.site_ids.length > 0 && preceptor.id) {
			log.debug('Associating preceptor with sites', {
				preceptorId: preceptor.id,
				siteCount: validatedData.site_ids.length
			});
			await setPreceptorSites(db, preceptor.id, validatedData.site_ids);
		}

		// Auto-associate with user's active schedule
		if (preceptor.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'preceptor', preceptor.id);
		}

		log.info('Preceptor created', {
			id: preceptor.id,
			name: preceptor.name,
			email: preceptor.email,
			siteCount: validatedData.site_ids?.length || 0
		});

		return successResponse(preceptor, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Preceptor validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Preceptor conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to create preceptor', { error });
		return handleApiError(error);
	}
};
