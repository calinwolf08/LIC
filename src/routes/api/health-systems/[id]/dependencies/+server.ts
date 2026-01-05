/**
 * Health Systems Dependencies API
 *
 * GET /api/health-systems/[id]/dependencies
 * Get dependency counts for a health system
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:health-systems:dependencies');
const service = new HealthSystemService(db);

/**
 * GET /api/health-systems/[id]/dependencies
 * Get dependency counts for a health system
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching health system dependencies', { id: params.id });

	try {
		const result = await service.getHealthSystemDependencies(params.id);

		if (!result.success) {
			log.warn('Failed to fetch health system dependencies', {
				id: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Health system dependencies fetched', {
			id: params.id,
			sites: result.data.sites,
			preceptors: result.data.preceptors,
			studentOnboarding: result.data.studentOnboarding,
			total: result.data.total
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch health system dependencies', { id: params.id, error });
		return handleApiError(error);
	}
};
