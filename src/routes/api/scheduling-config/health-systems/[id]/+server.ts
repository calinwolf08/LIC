/**
 * Health Systems API - Individual Resource Endpoints
 *
 * GET /api/scheduling-config/health-systems/[id] - Get single health system
 * PUT /api/scheduling-config/health-systems/[id] - Update health system
 * DELETE /api/scheduling-config/health-systems/[id] - Delete health system
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { healthSystemInputSchema } from '$lib/features/scheduling-config/schemas/health-systems.schemas';
import { ZodError } from 'zod';

const service = new HealthSystemService(db);

/**
 * GET /api/scheduling-config/health-systems/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await service.getHealthSystem(params.id);

		if (!result.success || !result.data) {
			return notFoundResponse('Health system');
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * PUT /api/scheduling-config/health-systems/[id]
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const validatedData = healthSystemInputSchema.parse(body);

		const result = await service.updateHealthSystem(params.id, validatedData);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/scheduling-config/health-systems/[id]
 * Alias for PUT to support both methods
 */
export const PATCH: RequestHandler = PUT;

/**
 * DELETE /api/scheduling-config/health-systems/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		console.log('[DELETE Health System] Attempting to delete:', params.id);

		// Check dependencies first
		const dependencies = await service.getHealthSystemDependencies(params.id);
		console.log('[DELETE Health System] Dependencies:', dependencies);

		const result = await service.deleteHealthSystem(params.id);

		if (!result.success) {
			console.log('[DELETE Health System] Failed:', result.error.message);
			return errorResponse(result.error.message, 400);
		}

		console.log('[DELETE Health System] Success');
		return successResponse({ deleted: true });
	} catch (error) {
		console.error('[DELETE Health System] Error:', error);
		return handleApiError(error);
	}
};
