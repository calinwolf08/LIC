import { siteService } from '$lib/features/sites/services/site-service';
import { clerkshipSiteSchema } from '$lib/features/sites/schemas';
import { ZodError } from 'zod';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import type { RequestHandler } from './$types';

/**
 * GET /api/clerkship-sites
 * Get all clerkship-site associations or filter by clerkship_id or site_id
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkship_id');
		const siteId = url.searchParams.get('site_id');

		if (clerkshipId) {
			const sites = await siteService.getSitesByClerkship(clerkshipId);
			return successResponse(sites);
		}

		if (siteId) {
			const clerkships = await siteService.getClerkshipsBySite(siteId);
			return successResponse(clerkships);
		}

		return errorResponse('Either clerkship_id or site_id parameter is required', 400);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/clerkship-sites
 * Add a clerkship-site association
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { clerkship_id, site_id } = clerkshipSiteSchema.parse(body);

		const association = await siteService.addClerkshipToSite(site_id, clerkship_id);

		return successResponse(association, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkship-sites
 * Remove a clerkship-site association
 */
export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkship_id');
		const siteId = url.searchParams.get('site_id');

		if (!clerkshipId || !siteId) {
			return errorResponse('Both clerkship_id and site_id parameters are required', 400);
		}

		const { clerkship_id, site_id } = clerkshipSiteSchema.parse({
			clerkship_id: clerkshipId,
			site_id: siteId
		});

		await siteService.removeClerkshipFromSite(site_id, clerkship_id);

		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
