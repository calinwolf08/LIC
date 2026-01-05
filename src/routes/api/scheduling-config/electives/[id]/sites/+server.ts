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
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-config:electives:sites');
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
	log.debug('Fetching sites for elective', { electiveId: params.id });

	try {
		const result = await service.getSitesForElective(params.id);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Elective not found', { electiveId: params.id });
				return notFoundResponse('Elective');
			}
			log.warn('Failed to fetch sites for elective', {
				electiveId: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Sites for elective fetched', {
			electiveId: params.id,
			siteCount: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch sites for elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/electives/[id]/sites
 * Adds a site to an elective
 */
export const POST: RequestHandler = async ({ params, request }) => {
	log.debug('Adding site to elective', { electiveId: params.id });

	try {
		const body = await request.json();
		const { siteId } = addSiteSchema.parse(body);

		const result = await service.addSiteToElective(params.id, siteId);

		if (!result.success) {
			if (result.error.code === 'NOT_FOUND') {
				log.warn('Site or elective not found', { electiveId: params.id, siteId });
				return notFoundResponse(result.error.message.includes('Site') ? 'Site' : 'Elective');
			}
			log.warn('Failed to add site to elective', {
				electiveId: params.id,
				siteId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Site added to elective', { electiveId: params.id, siteId });
		return successResponse({ added: true }, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Site addition validation failed', {
				electiveId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to add site to elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/electives/[id]/sites
 * Sets all sites for an elective (replaces existing)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Setting sites for elective', { electiveId: params.id });

	try {
		const body = await request.json();
		const { siteIds } = setSitesSchema.parse(body);

		const result = await service.setSitesForElective(params.id, siteIds);

		if (!result.success) {
			log.warn('Failed to set sites for elective', {
				electiveId: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Sites set for elective', {
			electiveId: params.id,
			siteCount: siteIds.length
		});

		return successResponse({ updated: true });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Site set validation failed', {
				electiveId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to set sites for elective', { electiveId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/scheduling-config/electives/[id]/sites?siteId=xxx
 * Removes a site from an elective
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const siteId = url.searchParams.get('siteId');

	log.debug('Removing site from elective', { electiveId: params.id, siteId });

	try {
		if (!siteId) {
			log.warn('Missing siteId parameter for site removal', { electiveId: params.id });
			return errorResponse('siteId query parameter is required', 400);
		}

		const result = await service.removeSiteFromElective(params.id, siteId);

		if (!result.success) {
			log.warn('Failed to remove site from elective', {
				electiveId: params.id,
				siteId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Site removed from elective', { electiveId: params.id, siteId });
		return successResponse({ removed: true });
	} catch (error) {
		log.error('Failed to remove site from elective', { electiveId: params.id, siteId, error });
		return handleApiError(error);
	}
};
