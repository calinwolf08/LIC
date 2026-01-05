import { siteService } from '$lib/features/sites/services/site-service';
import { updateSiteSchema, siteIdSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError, handleApiError } from '$lib/api/errors';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { createServerLogger } from '$lib/utils/logger.server';
import type { RequestHandler } from './$types';

const log = createServerLogger('api:sites:id');

/**
 * GET /api/sites/[id]
 * Get a single site by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching site', { id: params.id });

	try {
		const { id } = siteIdSchema.parse(params);
		const site = await siteService.getSiteById(id);

		log.info('Site fetched', {
			id,
			name: site.name,
			healthSystemId: site.health_system_id
		});

		return successResponse(site);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid site ID format', { id: params.id });
			return errorResponse('Invalid site ID', 400);
		}

		if (error instanceof NotFoundError) {
			log.warn('Site not found', { id: params.id });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to fetch site', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/sites/[id]
 * Update a site
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating site', { id: params.id });

	try {
		const { id } = siteIdSchema.parse(params);
		const body = await request.json();
		const input = updateSiteSchema.parse(body);

		const site = await siteService.updateSite(id, input);

		log.info('Site updated', {
			id,
			name: site.name,
			updatedFields: Object.keys(input)
		});

		return successResponse(site);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Site update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Site not found for update', { id: params.id });
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			log.warn('Site update conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to update site', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/sites/[id]
 * Delete a site
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting site', { id: params.id });

	try {
		const { id } = siteIdSchema.parse(params);
		await siteService.deleteSite(id);

		log.info('Site deleted', { id });
		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid site ID format for deletion', { id: params.id });
			return errorResponse('Invalid site ID', 400);
		}

		if (error instanceof NotFoundError) {
			log.warn('Site not found for deletion', { id: params.id });
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			log.warn('Site deletion conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to delete site', { id: params.id, error });
		return handleApiError(error);
	}
};
