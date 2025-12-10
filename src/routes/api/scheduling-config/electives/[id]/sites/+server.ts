/**
 * Elective Sites API - Association Endpoints
 *
 * GET /api/scheduling-config/electives/[id]/sites - Get sites for elective
 * POST /api/scheduling-config/electives/[id]/sites - Add site to elective
 * PUT /api/scheduling-config/electives/[id]/sites - Set all sites for elective
 * DELETE /api/scheduling-config/electives/[id]/sites?siteId=xxx - Remove site from elective
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse,
	validationErrorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { z } from 'zod';
import { ZodError } from 'zod';

const service = new ElectiveService(db);

const addSiteSchema = z.object({
	siteId: z.string().min(1, 'Site ID is required'),
});

const setSitesSchema = z.object({
	siteIds: z.array(z.string()),
});

/**
 * GET /api/scheduling-config/electives/[id]/sites
 * Returns sites associated with an elective
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getSitesForElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse('Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives/[id]/sites
 * Adds a site to an elective
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const { siteId } = addSiteSchema.parse(body);

		const result = await service.addSiteToElective(params.id, siteId);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				return notFoundResponse(result.error.message.includes('Site') ? 'Site' : 'Elective');
			}
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ added: true }, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/electives/[id]/sites
 * Sets all sites for an elective (replaces existing)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const { siteIds } = setSitesSchema.parse(body);

		const result = await service.setSitesForElective(params.id, siteIds);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ updated: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]/sites?siteId=xxx
 * Removes a site from an elective
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const siteId = url.searchParams.get('siteId');

		if (!siteId) {
			return errorResponse('siteId query parameter is required', 400);
		}

		const result = await service.removeSiteFromElective(params.id, siteId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ removed: true });
	} catch (error) {
		return handleApiError(error);
	}
};
