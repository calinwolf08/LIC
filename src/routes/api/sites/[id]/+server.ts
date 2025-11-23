import { siteService } from '$lib/features/sites/services/site-service';
import { updateSiteSchema, siteIdSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError, handleApiError } from '$lib/api/errors';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import type { RequestHandler } from './$types';

/**
 * GET /api/sites/[id]
 * Get a single site by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		const site = await siteService.getSiteById(id);

		return successResponse(site);
	} catch (error) {
		if (error instanceof ZodError) {
			return errorResponse('Invalid site ID', 400);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/sites/[id]
 * Update a site
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		const body = await request.json();
		const input = updateSiteSchema.parse(body);

		const site = await siteService.updateSite(id, input);

		return successResponse(site);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/sites/[id]
 * Delete a site
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id } = siteIdSchema.parse(params);
		await siteService.deleteSite(id);

		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return errorResponse('Invalid site ID', 400);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
