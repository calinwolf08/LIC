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

/**
 * GET /api/clerkships/[id]/settings
 * Returns clerkship settings merged with global defaults
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const service = new ClerkshipSettingsService(db);
		const settings = await service.getClerkshipSettings(params.id);
		return successResponse(settings);
	} catch (error) {
		if (error instanceof Error && error.message === 'Clerkship not found') {
			return notFoundResponse('Clerkship');
		}
		return handleApiError(error);
	}
};

/**
 * PUT /api/clerkships/[id]/settings
 * Updates clerkship settings (creates override from global defaults)
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const service = new ClerkshipSettingsService(db);
		await service.updateClerkshipSettings(params.id, body);
		return successResponse({ success: true });
	} catch (error) {
		if (error instanceof Error && error.message === 'Clerkship not found') {
			return notFoundResponse('Clerkship');
		}
		return handleApiError(error);
	}
};

/**
 * DELETE /api/clerkships/[id]/settings
 * Resets clerkship to use global defaults
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const service = new ClerkshipSettingsService(db);
		await service.resetToDefaults(params.id);
		return successResponse({ success: true });
	} catch (error) {
		return handleApiError(error);
	}
};
