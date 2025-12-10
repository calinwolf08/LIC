/**
 * Preceptors API - Collection Endpoints
 *
 * GET /api/preceptors - List all preceptors with associations
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
	getPreceptorsWithAssociations,
	setPreceptorSites
} from '$lib/features/preceptors/services/preceptor-service.js';
import { createPreceptorSchema } from '$lib/features/preceptors/schemas.js';
import { autoAssociateWithActiveSchedule } from '$lib/api/schedule-context';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors
 * Returns all preceptors with their associations (health system, sites, clerkships, teams)
 */
export const GET: RequestHandler = async () => {
	try {
		const preceptors = await getPreceptorsWithAssociations(db);
		return successResponse(preceptors);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors
 * Creates a new preceptor and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const validatedData = createPreceptorSchema.parse(body);

		const preceptor = await createPreceptor(db, validatedData);

		// Handle site_ids if provided (new multi-site support)
		if (validatedData.site_ids && validatedData.site_ids.length > 0 && preceptor.id) {
			await setPreceptorSites(db, preceptor.id, validatedData.site_ids);
		}

		// Auto-associate with user's active schedule
		if (preceptor.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'preceptor', preceptor.id);
		}

		return successResponse(preceptor, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
