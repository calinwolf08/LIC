/**
 * Capacity Rules API - Collection Endpoints
 *
 * GET /api/scheduling-config/capacity-rules - List capacity rules (filtered by preceptor)
 * POST /api/scheduling-config/capacity-rules - Create new capacity rule
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { CapacityRuleService } from '$lib/features/scheduling-config/services/capacity.service';
import { preceptorCapacityRuleInputSchema } from '$lib/features/scheduling-config/schemas/capacity.schemas';
import { ZodError } from 'zod';

const service = new CapacityRuleService(db);

/**
 * GET /api/scheduling-config/capacity-rules
 * Returns capacity rules, optionally filtered by preceptor
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const preceptorId = url.searchParams.get('preceptorId');

		if (!preceptorId) {
			return errorResponse('preceptorId query parameter is required', 400);
		}

		const result = await service.getCapacityRulesByPreceptor(preceptorId);

		if (!result.success) {
			return errorResponse(result.error.message, 400);
		}

		return successResponse(result.data);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-config/capacity-rules
 * Creates a new capacity rule
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = preceptorCapacityRuleInputSchema.parse(body);

		const result = await service.createCapacityRule(validatedData);

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
