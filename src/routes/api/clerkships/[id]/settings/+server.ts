/**
 * Clerkship Settings API Endpoint
 *
 * GET /api/clerkships/[id]/settings - Get clerkship settings (merged with defaults)
 * PUT /api/clerkships/[id]/settings - Update clerkship settings (creates override)
 * DELETE /api/clerkships/[id]/settings - Reset to global defaults
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, notFoundResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { ClerkshipSettingsService } from '$lib/features/clerkships/services/clerkship-settings.service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:clerkships:settings');

/**
 * GET /api/clerkships/[id]/settings
 * Returns clerkship settings merged with global defaults
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching clerkship settings', { clerkshipId: params.id });

	try {
		const service = new ClerkshipSettingsService(db);
		const settings = await service.getClerkshipSettings(params.id);

		log.info('Clerkship settings fetched', {
			clerkshipId: params.id,
			hasCustomSettings: !!settings.clerkship_id
		});

		return successResponse(settings);
	} catch (error) {
		if (error instanceof Error && error.message === 'Clerkship not found') {
			log.warn('Clerkship not found', { clerkshipId: params.id });
			return notFoundResponse('Clerkship');
		}
		log.error('Failed to fetch clerkship settings', { clerkshipId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/clerkships/[id]/settings
 * Updates clerkship settings (creates override from global defaults)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Updating clerkship settings', { clerkshipId: params.id });

	try {
		const body = await request.json();
		const service = new ClerkshipSettingsService(db);
		await service.updateClerkshipSettings(params.id, body);

		log.info('Clerkship settings updated', {
			clerkshipId: params.id,
			updatedFields: Object.keys(body)
		});

		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof Error && error.message === 'Clerkship not found') {
			log.warn('Clerkship not found for settings update', { clerkshipId: params.id });
			return notFoundResponse('Clerkship');
		}
		log.error('Failed to update clerkship settings', { clerkshipId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkships/[id]/settings
 * Resets clerkship to use global defaults
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Resetting clerkship to default settings', { clerkshipId: params.id });

	try {
		const service = new ClerkshipSettingsService(db);
		await service.resetToDefaults(params.id);

		log.info('Clerkship settings reset to defaults', { clerkshipId: params.id });
		return successResponse({ success: true });
	} catch (error) {
		log.error('Failed to reset clerkship settings', { clerkshipId: params.id, error });
		return handleApiError(error);
	}
};
