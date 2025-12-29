import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { GlobalDefaultsService } from '$lib/features/scheduling-config/services/global-defaults.service';
import { globalOutpatientDefaultsInputSchema } from '$lib/features/scheduling-config/schemas/global-defaults.schemas';
import { handleApiError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:scheduling-config:global-defaults:outpatient');
const service = new GlobalDefaultsService(db);

/**
 * GET /api/scheduling-config/global-defaults/outpatient
 * Fetch global outpatient defaults
 */
export const GET: RequestHandler = async ({ url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Fetching outpatient defaults', { schoolId });

	try {
		const result = await service.getOutpatientDefaults(schoolId);

		if (!result.success) {
			log.warn('Failed to fetch outpatient defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Outpatient defaults fetched', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to fetch outpatient defaults', { schoolId, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/global-defaults/outpatient
 * Update global outpatient defaults
 */
export const PUT: RequestHandler = async ({ request, url }) => {
	const schoolId = url.searchParams.get('school_id') || 'default';
	log.debug('Updating outpatient defaults', { schoolId });

	try {
		const body = await request.json();

		// Validate input
		const validation = globalOutpatientDefaultsInputSchema.safeParse(body);
		if (!validation.success) {
			log.warn('Outpatient defaults validation failed', {
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

		const result = await service.updateOutpatientDefaults(schoolId, validation.data);

		if (!result.success) {
			log.warn('Failed to update outpatient defaults', { schoolId, error: result.error });
			return handleApiError(result.error);
		}

		log.info('Outpatient defaults updated', { schoolId });
		return json({ data: result.data });
	} catch (error) {
		log.error('Failed to update outpatient defaults', { schoolId, error });
		return handleApiError(error);
	}
};
