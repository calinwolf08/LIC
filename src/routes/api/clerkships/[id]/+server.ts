/**
 * Clerkships API - Individual Clerkship Endpoints
 *
 * GET /api/clerkships/[id] - Get single clerkship
 * PATCH /api/clerkships/[id] - Update clerkship
 * DELETE /api/clerkships/[id] - Delete clerkship
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse,
	notFoundResponse,
	handleApiError
} from '$lib/api/responses';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import {
	getClerkshipById,
	updateClerkship,
	deleteClerkship
} from '$lib/features/clerkships/services/clerkship-service';
import { updateClerkshipSchema, clerkshipIdSchema } from '$lib/features/clerkships/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/clerkships/[id]
 * Returns a single clerkship
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		const clerkship = await getClerkshipById(db, id);

		if (!clerkship) {
			return notFoundResponse('Clerkship');
		}

		return successResponse(clerkship);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/clerkships/[id]
 * Updates a clerkship
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateClerkshipSchema.parse(body);

		const updatedClerkship = await updateClerkship(db, id, validatedData);

		return successResponse(updatedClerkship);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Clerkship');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkships/[id]
 * Deletes a clerkship
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		await deleteClerkship(db, id);

		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Clerkship');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
