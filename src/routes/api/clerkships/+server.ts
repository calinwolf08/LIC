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
import { ZodError } from 'zod';

/**
 * GET /api/clerkships
 * Returns all clerkships
 */
export const GET: RequestHandler = async () => {
	try {
		const clerkships = await getClerkships(db);

		return successResponse(clerkships);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/clerkships
 * Creates a new clerkship and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const validatedData = createClerkshipSchema.parse(body);

		const clerkship = await createClerkship(db, validatedData);

		// Auto-associate with user's active schedule
		if (clerkship.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'clerkship', clerkship.id);
		}

		return successResponse(clerkship, 201);
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
