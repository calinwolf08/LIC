/**
 * Clerkships API - Collection Endpoints
 *
 * GET /api/clerkships - List all clerkships (optionally filter by specialty)
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
	getClerkshipsBySpecialty,
	createClerkship
} from '$lib/features/clerkships/services/clerkship-service.js';
import { createClerkshipSchema } from '$lib/features/clerkships/schemas.js';
import { ZodError } from 'zod';

/**
 * GET /api/clerkships
 * Returns all clerkships, optionally filtered by specialty
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const specialty = url.searchParams.get('specialty');

		const clerkships = specialty
			? await getClerkshipsBySpecialty(db, specialty)
			: await getClerkships(db);

		return successResponse(clerkships);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/clerkships
 * Creates a new clerkship
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = createClerkshipSchema.parse(body);

		const clerkship = await createClerkship(db, validatedData);

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
