/**
 * Available Preceptors for Elective API
 *
 * GET /api/scheduling-config/electives/[id]/available-preceptors
 * Returns preceptors who work at the elective's associated sites
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:electives:available-preceptors');
const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives/[id]/available-preceptors
 * Returns preceptors available for this elective (filtered by elective's sites)
 */
export const GET: RequestHandler = async ({ params }) => {
	const electiveId = params.id;

	log.debug('Fetching available preceptors for elective', { electiveId });

	try {
		const result = await service.getAvailablePreceptorsForElective(electiveId);

		if (!result.success) {
			log.warn('Failed to fetch available preceptors', {
				electiveId,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Available preceptors fetched', {
			electiveId,
			count: result.data.length
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch available preceptors', { electiveId, error });
		return handleApiError(error);
	}
};
