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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:patterns:item');

/**
 * GET /api/preceptors/[id]/patterns/[pattern_id]
 * Returns a single pattern
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching pattern', {
		preceptorId: params.id,
		patternId: params.pattern_id
	});

	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		const pattern = await getPatternById(db, patternId);

		if (!pattern) {
			log.warn('Pattern not found', { preceptorId, patternId });
			return errorResponse('Pattern not found', 404);
		}

		// Verify pattern belongs to this preceptor
		if (pattern.preceptor_id !== preceptorId) {
			log.warn('Pattern access forbidden', {
				preceptorId,
				patternId,
				actualPreceptorId: pattern.preceptor_id
			});
			return errorResponse('Pattern does not belong to this preceptor', 403);
		}

		// Parse config JSON
		const parsedPattern = {
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		};

		log.info('Pattern fetched', {
			preceptorId,
			patternId,
			patternType: pattern.pattern_type,
			isEnabled: Boolean(pattern.enabled)
		});

		return successResponse(parsedPattern);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern query validation failed', {
				preceptorId: params.id,
				patternId: params.pattern_id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch pattern', {
			preceptorId: params.id,
			patternId: params.pattern_id,
			error
		});
		return handleApiError(error);
	}
};

/**
 * PUT /api/preceptors/[id]/patterns/[pattern_id]
 * Update a pattern
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Updating pattern', {
		preceptorId: params.id,
		patternId: params.pattern_id
	});

	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		// Verify pattern exists and belongs to preceptor
		const existing = await getPatternById(db, patternId);
		if (!existing) {
			log.warn('Pattern not found for update', { preceptorId, patternId });
			return errorResponse('Pattern not found', 404);
		}
		if (existing.preceptor_id !== preceptorId) {
			log.warn('Pattern update forbidden', {
				preceptorId,
				patternId,
				actualPreceptorId: existing.preceptor_id
			});
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

		log.info('Pattern updated', {
			preceptorId,
			patternId,
			patternType: pattern.pattern_type,
			isEnabled: Boolean(pattern.enabled)
		});

		return successResponse(parsedPattern);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern update validation failed', {
				preceptorId: params.id,
				patternId: params.pattern_id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Pattern not found during update', {
				preceptorId: params.id,
				patternId: params.pattern_id
			});
			return errorResponse(error.message, 404);
		}

		log.error('Failed to update pattern', {
			preceptorId: params.id,
			patternId: params.pattern_id,
			error
		});
		return handleApiError(error);
	}
};

/**
 * DELETE /api/preceptors/[id]/patterns/[pattern_id]
 * Delete a pattern
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting pattern', {
		preceptorId: params.id,
		patternId: params.pattern_id
	});

	try {
		// Validate IDs
		const { id: preceptorId } = preceptorIdSchema.parse({ id: params.id });
		const patternId = cuid2Schema.parse(params.pattern_id);

		// Verify pattern exists and belongs to preceptor
		const existing = await getPatternById(db, patternId);
		if (!existing) {
			log.warn('Pattern not found for deletion', { preceptorId, patternId });
			return errorResponse('Pattern not found', 404);
		}
		if (existing.preceptor_id !== preceptorId) {
			log.warn('Pattern deletion forbidden', {
				preceptorId,
				patternId,
				actualPreceptorId: existing.preceptor_id
			});
			return errorResponse('Pattern does not belong to this preceptor', 403);
		}

		await deletePattern(db, patternId);

		log.info('Pattern deleted', {
			preceptorId,
			patternId,
			patternType: existing.pattern_type
		});

		return successResponse({ message: 'Pattern deleted successfully' });
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern deletion validation failed', {
				preceptorId: params.id,
				patternId: params.pattern_id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Pattern not found during deletion', {
				preceptorId: params.id,
				patternId: params.pattern_id
			});
			return errorResponse(error.message, 404);
		}

		log.error('Failed to delete pattern', {
			preceptorId: params.id,
			patternId: params.pattern_id,
			error
		});
		return handleApiError(error);
	}
};
