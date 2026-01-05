import type { RequestHandler } from './$types';
import { siteService } from '$lib/features/sites/services/site-service';
import { successResponse, handleApiError } from '$lib/api';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:sites:dependencies');

/**
 * GET /api/sites/[id]/dependencies
 * Get dependency counts for a site
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching site dependencies', { siteId: params.id });

	try {
		const dependencies = await siteService.getSiteDependencies(params.id);

		log.info('Site dependencies fetched', {
			siteId: params.id,
			preceptors: dependencies.preceptors,
			electives: dependencies.electives,
			clerkships: dependencies.clerkships,
			total: dependencies.total
		});

		return successResponse(dependencies);
	} catch (error) {
		log.error('Failed to fetch site dependencies', { siteId: params.id, error });
		return handleApiError(error);
	}
};
