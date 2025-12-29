import { siteService } from '$lib/features/sites/services/site-service';
import { clerkshipSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';
import type { RequestHandler } from './$types';

const log = createServerLogger('api:clerkship-sites');

/**
 * GET /api/clerkship-sites
 * Get all clerkship-site associations or filter by clerkship_id or site_id
 */
export const GET: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkship_id');
	const siteId = url.searchParams.get('site_id');

	log.debug('Fetching clerkship-site associations', { clerkshipId, siteId });

	try {
		if (clerkshipId) {
			const sites = await siteService.getSitesByClerkship(clerkshipId);
			log.info('Sites fetched for clerkship', { clerkshipId, count: sites.length });
			return successResponse(sites);
		}

		if (siteId) {
			const clerkships = await siteService.getClerkshipsBySite(siteId);
			log.info('Clerkships fetched for site', { siteId, count: clerkships.length });
			return successResponse(clerkships);
		}

		log.warn('Missing required query parameter');
		return errorResponse('Either clerkship_id or site_id parameter is required', 400);
	} catch (error) {
		log.error('Failed to fetch clerkship-site associations', { clerkshipId, siteId, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/clerkship-sites
 * Add a clerkship-site association
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Adding clerkship-site association');

	try {
		const body = await request.json();
		const { clerkship_id, site_id } = clerkshipSiteSchema.parse(body);

		const association = await siteService.addClerkshipToSite(site_id, clerkship_id);

		log.info('Clerkship-site association added', {
			clerkshipId: clerkship_id,
			siteId: site_id
		});

		return successResponse(association, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Clerkship-site association validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to add clerkship-site association', { error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkship-sites
 * Remove a clerkship-site association
 */
export const DELETE: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkship_id');
	const siteId = url.searchParams.get('site_id');

	log.debug('Removing clerkship-site association', { clerkshipId, siteId });

	try {
		if (!clerkshipId || !siteId) {
			log.warn('Missing required query parameters for deletion');
			return errorResponse('Both clerkship_id and site_id parameters are required', 400);
		}

		const { clerkship_id, site_id } = clerkshipSiteSchema.parse({
			clerkship_id: clerkshipId,
			site_id: siteId
		});

		await siteService.removeClerkshipFromSite(site_id, clerkship_id);

		log.info('Clerkship-site association removed', {
			clerkshipId: clerkship_id,
			siteId: site_id
		});

		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Clerkship-site association validation failed', {
				clerkshipId,
				siteId,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to remove clerkship-site association', { clerkshipId, siteId, error });
		return handleApiError(error);
	}
};
