/**
 * Preceptors API - Individual Preceptor Endpoints
 *
 * GET /api/preceptors/[id] - Get single preceptor
 * PATCH /api/preceptors/[id] - Update preceptor
 * DELETE /api/preceptors/[id] - Delete preceptor
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
	getPreceptorById,
	updatePreceptor,
	deletePreceptor,
	setPreceptorSites,
	getPreceptorSites
} from '$lib/features/preceptors/services/preceptor-service.js';
import { updatePreceptorSchema, preceptorIdSchema } from '$lib/features/preceptors/schemas.js';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors/[id]
 * Returns a single preceptor with their site IDs
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const preceptor = await getPreceptorById(db, id);

		if (!preceptor) {
			return notFoundResponse('Preceptor');
		}

		// Get site IDs for this preceptor
		const siteIds = await getPreceptorSites(db, id);

		return successResponse({
			...preceptor,
			site_ids: siteIds
		});
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/preceptors/[id]
 * Updates a preceptor
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updatePreceptorSchema.parse(body);

		const updatedPreceptor = await updatePreceptor(db, id, validatedData);

		// Handle site_ids if provided (new multi-site support)
		if (validatedData.site_ids !== undefined) {
			await setPreceptorSites(db, id, validatedData.site_ids);
		}

		// Get updated site IDs
		const siteIds = await getPreceptorSites(db, id);

		return successResponse({
			...updatedPreceptor,
			site_ids: siteIds
		});
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Preceptor');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/[id]
 * Deletes a preceptor
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		await deletePreceptor(db, id);

		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Preceptor');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
