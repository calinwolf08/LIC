/**
 * Clerkship Configuration API
 *
 * GET /api/scheduling-config/clerkships/[id] - Get complete configuration for a clerkship
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { ConfigurationService } from '$lib/features/scheduling-config/services/configuration.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:clerkships:id');
const service = new ConfigurationService(db);

/**
 * GET /api/scheduling-config/clerkships/[id]
 * Returns complete configuration for a clerkship including:
 * - All requirements (outpatient, inpatient, elective)
 * - Resolved configuration for each requirement
 * - Teams assigned to each requirement
 * - Electives for elective requirements
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	log.debug('Fetching clerkship configuration', { clerkshipId: params.id });

	try {
		// Tenant boundary: the clerkship must be in the caller's schedule.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'clerkship', params.id);

		const result = await service.getCompleteConfiguration(params.id);

		if (!result.success || !result.data) {
			log.warn('Clerkship configuration not found', { clerkshipId: params.id });
			return notFoundResponse('Clerkship configuration');
		}

		log.info('Clerkship configuration fetched', {
			clerkshipId: params.id,
			electiveCount: result.data.electives?.length || 0
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch clerkship configuration', { clerkshipId: params.id, error });
		return handleApiError(error);
	}
};
