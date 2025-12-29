/**
 * Preceptor Availability Patterns API
 *
 * GET /api/preceptors/[id]/patterns - Get all patterns for a preceptor
 * POST /api/preceptors/[id]/patterns - Create a new pattern
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
	getPatterns,
	createPattern
} from '$lib/features/preceptors/services/pattern-service';
import { createPatternSchema } from '$lib/features/preceptors/pattern-schemas';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:patterns');

/**
 * GET /api/preceptors/[id]/patterns
 * Returns all patterns for a preceptor
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching preceptor patterns', { preceptorId: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const patterns = await getPatterns(db, id);

		// Parse config JSON for each pattern
		const parsedPatterns = patterns.map(pattern => ({
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		}));

		log.info('Preceptor patterns fetched', {
			preceptorId: id,
			count: parsedPatterns.length
		});

		return successResponse(parsedPatterns);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern query validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch preceptor patterns', { preceptorId: params.id, error });
		return handleApiError(error);
	}
};

/**
 * POST /api/preceptors/[id]/patterns
 * Create a new pattern for a preceptor
 */
export const POST: RequestHandler = async ({ params, request }) => {
	log.debug('Creating preceptor pattern', { preceptorId: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = createPatternSchema.parse({
			preceptor_id: id,
			...body
		});

		const pattern = await createPattern(db, validatedData);

		// Parse config JSON
		const parsedPattern = {
			...pattern,
			config: pattern.config ? JSON.parse(pattern.config) : null
		};

		log.info('Preceptor pattern created', {
			preceptorId: id,
			patternId: pattern.id,
			patternType: pattern.pattern_type,
			isEnabled: pattern.is_enabled
		});

		return successResponse(parsedPattern, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern creation validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for pattern creation', { preceptorId: params.id });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to create preceptor pattern', { preceptorId: params.id, error });
		return handleApiError(error);
	}
};
