/**
 * Health Systems API - Collection Endpoints
 *
 * GET /api/health-systems - List all health systems
 * POST /api/health-systems - Create new health system
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { HealthSystemService } from '$lib/features/scheduling-config/services/health-systems.service';
import { healthSystemInputSchema } from '$lib/features/scheduling-config/schemas/health-systems.schemas';
import { ZodError } from 'zod';

const service = new HealthSystemService(db);

/**
 * GET /api/health-systems
 * Returns all health systems
 */
export const GET: RequestHandler = async () => {
	try {
		const result = await service.listHealthSystems();

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/health-systems
 * Creates a new health system
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = healthSystemInputSchema.parse(body);

		const result = await service.createHealthSystem(validatedData);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};
