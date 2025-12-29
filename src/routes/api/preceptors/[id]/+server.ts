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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:id');

/**
 * GET /api/preceptors/[id]
 * Returns a single preceptor with their site IDs
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching preceptor', { id: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const preceptor = await getPreceptorById(db, id);

		if (!preceptor) {
			log.warn('Preceptor not found', { id });
			return notFoundResponse('Preceptor');
		}

		// Get site IDs for this preceptor
		const siteIds = await getPreceptorSites(db, id);

		log.info('Preceptor fetched', {
			id,
			name: preceptor.name,
			siteCount: siteIds.length
		});

		return successResponse({
			...preceptor,
			site_ids: siteIds
		});
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid preceptor ID format', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch preceptor', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/preceptors/[id]
 * Updates a preceptor
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating preceptor', { id: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updatePreceptorSchema.parse(body);

		const updatedPreceptor = await updatePreceptor(db, id, validatedData);

		// Handle site_ids if provided (new multi-site support)
		if (validatedData.site_ids !== undefined) {
			log.debug('Updating preceptor site associations', {
				id,
				siteCount: validatedData.site_ids.length
			});
			await setPreceptorSites(db, id, validatedData.site_ids);
		}

		// Get updated site IDs
		const siteIds = await getPreceptorSites(db, id);

		log.info('Preceptor updated', {
			id,
			name: updatedPreceptor.name,
			updatedFields: Object.keys(validatedData),
			siteCount: siteIds.length
		});

		return successResponse({
			...updatedPreceptor,
			site_ids: siteIds
		});
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Preceptor update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for update', { id: params.id });
			return notFoundResponse('Preceptor');
		}

		if (error instanceof ConflictError) {
			log.warn('Preceptor update conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to update preceptor', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/[id]
 * Deletes a preceptor
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting preceptor', { id: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		await deletePreceptor(db, id);

		log.info('Preceptor deleted', { id });
		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid preceptor ID format for deletion', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for deletion', { id: params.id });
			return notFoundResponse('Preceptor');
		}

		if (error instanceof ConflictError) {
			log.warn('Preceptor deletion conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to delete preceptor', { id: params.id, error });
		return handleApiError(error);
	}
};
