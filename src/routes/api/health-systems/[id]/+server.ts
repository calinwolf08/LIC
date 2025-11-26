/**
 * Health Systems API - Individual Resource Endpoints
 *
 * GET /api/health-systems/[id] - Get single health system
 * PUT /api/health-systems/[id] - Update health system
 * DELETE /api/health-systems/[id] - Delete health system
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
 * GET /api/health-systems/[id]
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
 * PUT /api/health-systems/[id]
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
 * PATCH /api/health-systems/[id]
 * Alias for PUT to support both methods
 */
export const PATCH: RequestHandler = PUT;

/**
 * DELETE /api/health-systems/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Check dependencies first
		const dependencies = await service.getHealthSystemDependencies(params.id);

		const result = await service.deleteHealthSystem(params.id);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse({ deleted: true });
	} catch (error) {
		return handleApiError(error);
	}
};
