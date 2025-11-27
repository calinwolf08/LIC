/**
 * Individual Pattern API
 *
 * GET /api/preceptors/[id]/patterns/[pattern_id] - Get a single pattern
 * PUT /api/preceptors/[id]/patterns/[pattern_id] - Update a pattern
 * DELETE /api/preceptors/[id]/patterns/[pattern_id] - Delete a pattern
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import {
	getPatternById,
	updatePattern,
	deletePattern
} from '$lib/features/preceptors/services/pattern-service';
import { updatePatternSchema } from '$lib/features/preceptors/pattern-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { ZodError } from 'zod';

/**
 * GET /api/preceptors/[id]/patterns/[pattern_id]
 * Returns a single pattern
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		const pattern = await getPatternById(db, patternId);

		if (!pattern) {
			return errorResponse('Pattern not found', 404);
		}

		// Verify pattern belongs to this preceptor
		if (pattern.preceptor_id !== preceptorId) {
			return errorResponse('Pattern does not belong to this preceptor', 403);
		}

		// Parse config JSON
		const parsedPattern = {
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		};

		return successResponse(parsedPattern);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PUT /api/preceptors/[id]/patterns/[pattern_id]
 * Update a pattern
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		// Verify pattern exists and belongs to preceptor
		const existing = await getPatternById(db, patternId);
		if (!existing) {
			return errorResponse('Pattern not found', 404);
		}
		if (existing.preceptor_id !== preceptorId) {
			return errorResponse('Pattern does not belong to this preceptor', 403);
		}

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updatePatternSchema.parse(body);

		const pattern = await updatePattern(db, patternId, validatedData);

		// Parse config JSON
		const parsedPattern = {
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		};

		return successResponse(parsedPattern);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/[id]/patterns/[pattern_id]
 * Delete a pattern
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		// Verify pattern exists and belongs to preceptor
		const existing = await getPatternById(db, patternId);
		if (!existing) {
			return errorResponse('Pattern not found', 404);
		}
		if (existing.preceptor_id !== preceptorId) {
			return errorResponse('Pattern does not belong to this preceptor', 403);
		}

		await deletePattern(db, patternId);

		return successResponse({ message: 'Pattern deleted successfully' });
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return errorResponse(error.message, 404);
		}

		return handleApiError(error);
	}
};
