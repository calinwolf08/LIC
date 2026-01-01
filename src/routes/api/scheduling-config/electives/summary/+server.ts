/**
 * Electives Summary API
 *
 * GET /api/scheduling-config/electives/summary - Get elective days summary for a clerkship
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ElectiveService } from '$lib/features/scheduling-config/services/electives.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:electives:summary');
const service = new ElectiveService(db);

/**
 * GET /api/scheduling-config/electives/summary
 * Returns summary of elective days for a clerkship
 * Query params:
 *   - clerkshipId: clerkship ID (required)
 */
export const GET: RequestHandler = async ({ url }) => {
	const clerkshipId = url.searchParams.get('clerkshipId');

	log.debug('Fetching elective days summary', { clerkshipId });

	try {
		if (!clerkshipId) {
			log.warn('Missing clerkshipId parameter');
			return errorResponse('clerkshipId query parameter is required', 400);
		}

		const result = await service.getElectiveDaysSummary(clerkshipId);

		if (!result.success) {
			log.warn('Failed to fetch elective days summary', {
				error: result.error.message,
				clerkshipId
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Elective days summary fetched', {
			clerkshipId,
			...result.data
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch elective days summary', { clerkshipId, error });
		return handleApiError(error);
	}
};
