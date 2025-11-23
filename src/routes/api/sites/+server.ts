import { siteService } from '$lib/features/sites/services/site-service';
import { createSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { ConflictError, NotFoundError, handleApiError } from '$lib/api/errors';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import type { RequestHandler } from './$types';

/**
 * GET /api/sites
 * Get all sites or filter by health system
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const healthSystemId = url.searchParams.get('health_system_id');

		const sites = healthSystemId
			? await siteService.getSitesByHealthSystem(healthSystemId)
			: await siteService.getAllSites();

		return successResponse(sites);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/sites
 * Create a new site
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const input = createSiteSchema.parse(body);

		const site = await siteService.createSite(input);

		return successResponse(site, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};
