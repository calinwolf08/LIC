import type { RequestHandler } from './$types';
import { siteService } from '$lib/features/sites/services/site-service';
import { successResponse, handleApiError } from '$lib/api';

/**
 * GET /api/sites/[id]/dependencies
 * Get dependency counts for a site
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const dependencies = await siteService.getSiteDependencies(params.id);
		return successResponse(dependencies);
	} catch (error) {
		return handleApiError(error);
	}
};
