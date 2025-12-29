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
	notFoundResponse
} from '$lib/api/responses';
import { NotFoundError, ConflictError, handleApiError } from '$lib/api/errors';
import {
	getClerkshipById,
	updateClerkship,
	deleteClerkship
} from '$lib/features/clerkships/services/clerkship-service.js';
import { updateClerkshipSchema, clerkshipIdSchema } from '$lib/features/clerkships/schemas.js';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:clerkships:id');

/**
 * GET /api/clerkships/[id]
 * Returns a single clerkship
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching clerkship', { id: params.id });

	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		const clerkship = await getClerkshipById(db, id);

		if (!clerkship) {
			log.warn('Clerkship not found', { id });
			return notFoundResponse('Clerkship');
		}

		log.info('Clerkship fetched', { id, name: clerkship.name });
		return successResponse(clerkship);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid clerkship ID format', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch clerkship', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/clerkships/[id]
 * Updates a clerkship
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating clerkship', { id: params.id });

	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateClerkshipSchema.parse(body);

		const updatedClerkship = await updateClerkship(db, id, validatedData);

		log.info('Clerkship updated', {
			id,
			name: updatedClerkship.name,
			updatedFields: Object.keys(validatedData)
		});

		return successResponse(updatedClerkship);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Clerkship update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Clerkship not found for update', { id: params.id });
			return notFoundResponse('Clerkship');
		}

		if (error instanceof ConflictError) {
			log.warn('Clerkship update conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to update clerkship', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkships/[id]
 * Deletes a clerkship
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting clerkship', { id: params.id });

	try {
		// Validate ID format
		const { id } = clerkshipIdSchema.parse({ id: params.id });

		await deleteClerkship(db, id);

		log.info('Clerkship deleted', { id });
		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid clerkship ID format for deletion', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Clerkship not found for deletion', { id: params.id });
			return notFoundResponse('Clerkship');
		}

		if (error instanceof ConflictError) {
			log.warn('Clerkship deletion conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to delete clerkship', { id: params.id, error });
		return handleApiError(error);
	}
};
