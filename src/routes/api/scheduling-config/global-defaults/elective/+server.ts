import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { GlobalDefaultsService } from '$lib/features/scheduling-config/services/global-defaults.service';
import { globalElectiveDefaultsInputSchema } from '$lib/features/scheduling-config/schemas/global-defaults.schemas';
import { handleApiError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:global-defaults:elective');
const service = new GlobalDefaultsService(db);

/**
 * GET /api/scheduling-config/global-defaults/elective
 * Fetch global elective defaults
 */
export const GET: RequestHandler = async ({ url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Fetching elective defaults', { schoolId });

	try {
		const result = await service.getElectiveDefaults(schoolId);

		if (!result.success) {
			log.warn('Failed to fetch elective defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Elective defaults fetched', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to fetch elective defaults', { schoolId, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/global-defaults/elective
 * Update global elective defaults
 */
export const PUT: RequestHandler = async ({ request, url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Updating elective defaults', { schoolId });

	try {
		const body = await request.json();

		// Validate input
		const validation = globalElectiveDefaultsInputSchema.safeParse(body);
		if (!validation.success) {
			log.warn('Elective defaults validation failed', {
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

		const result = await service.updateElectiveDefaults(schoolId, validation.data);

		if (!result.success) {
			log.warn('Failed to update elective defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Elective defaults updated', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to update elective defaults', { schoolId, error });
		return handleApiError(error);
	}
};
