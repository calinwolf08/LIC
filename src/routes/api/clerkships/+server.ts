/**
 * Clerkships API - Collection Endpoints
 *
 * GET /api/clerkships - List all clerkships
 * POST /api/clerkships - Create new clerkship
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
	getClerkships,
	createClerkship
} from '$lib/features/clerkships/services/clerkship-service.js';
import { createClerkshipSchema } from '$lib/features/clerkships/schemas.js';
import { autoAssociateWithActiveSchedule } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:clerkships');

/**
 * GET /api/clerkships
 * Returns all clerkships
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching all clerkships');

	try {
		const clerkships = await getClerkships(db);

		log.info('Clerkships fetched', { count: clerkships.length });
		return successResponse(clerkships);
	} catch (error) {
		log.error('Failed to fetch clerkships', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/clerkships
 * Creates a new clerkship and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating clerkship');

	try {
		const body = await request.json();
		const validatedData = createClerkshipSchema.parse(body);

		const clerkship = await createClerkship(db, validatedData);

		// Auto-associate with user's active schedule
		if (clerkship.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'clerkship', clerkship.id);
		}

		log.info('Clerkship created', {
			id: clerkship.id,
			name: clerkship.name,
			requiredDays: clerkship.required_days
		});

		return successResponse(clerkship, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Clerkship validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Clerkship conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to create clerkship', { error });
		return handleApiError(error);
	}
};
