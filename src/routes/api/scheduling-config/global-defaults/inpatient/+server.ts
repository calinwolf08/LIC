import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { GlobalDefaultsService } from '$lib/features/scheduling-config/services/global-defaults.service';
import { globalInpatientDefaultsInputSchema } from '$lib/features/scheduling-config/schemas/global-defaults.schemas';
import { handleApiError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:global-defaults:inpatient');
const service = new GlobalDefaultsService(db);

/**
 * GET /api/scheduling-config/global-defaults/inpatient
 * Fetch global inpatient defaults
 */
export const GET: RequestHandler = async ({ url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Fetching inpatient defaults', { schoolId });

	try {
		const result = await service.getInpatientDefaults(schoolId);

		if (!result.success) {
			log.warn('Failed to fetch inpatient defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Inpatient defaults fetched', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to fetch inpatient defaults', { schoolId, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/global-defaults/inpatient
 * Update global inpatient defaults
 */
export const PUT: RequestHandler = async ({ request, url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Updating inpatient defaults', { schoolId });

	try {
		const body = await request.json();

		// Validate input
		const validation = globalInpatientDefaultsInputSchema.safeParse(body);
		if (!validation.success) {
			log.warn('Inpatient defaults validation failed', {
				schoolId,
				errors: validation.error.errors
			});
			return json(
				{
					error: {
						message: 'Validation failed',
						details: validation.error.errors
					}
				},
				{ status: 400 }
			);
		}

		const result = await service.updateInpatientDefaults(schoolId, validation.data);

		if (!result.success) {
			log.warn('Failed to update inpatient defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Inpatient defaults updated', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to update inpatient defaults', { schoolId, error });
		return handleApiError(error);
	}
};
