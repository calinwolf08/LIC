import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { GlobalDefaultsService } from '$lib/features/scheduling-config/services/global-defaults.service';
import { globalInpatientDefaultsInputSchema } from '$lib/features/scheduling-config/schemas/global-defaults.schemas';
import { handleApiError } from '$lib/api/errors';

const service = new GlobalDefaultsService(db);

/**
 * GET /api/scheduling-config/global-defaults/inpatient
 * Fetch global inpatient defaults
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const schoolId = url.searchParams.get('school_id') || 'default';
		const result = await service.getInpatientDefaults(schoolId);

		if (!result.success) {
			return handleApiError(result.error);
		}

		return json({ data: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/global-defaults/inpatient
 * Update global inpatient defaults
 */
export const PUT: RequestHandler = async ({ request, url }) => {
	try {
		const schoolId = url.searchParams.get('school_id') || 'default';
		const body = await request.json();

		// Validate input
		const validation = globalInpatientDefaultsInputSchema.safeParse(body);
		if (!validation.success) {
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
			return handleApiError(result.error);
		}

		return json({ data: result.data });
	} catch (error) {
		return handleApiError(error);
	}
};
