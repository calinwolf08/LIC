/**
 * Pattern Date Generation API
 *
 * POST /api/preceptors/[id]/patterns/generate - Generate availability dates from patterns
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { generateDatesFromPatterns } from '$lib/features/preceptors/services/pattern-service';
import { preceptorIdSchema } from '$lib/features/preceptors/schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:preceptors:patterns:generate');

/**
 * POST /api/preceptors/[id]/patterns/generate
 * Generate availability dates from all enabled patterns
 * Returns preview without saving to database
 */
export const POST: RequestHandler = async ({ params }) => {
	log.debug('Generating pattern dates preview', { preceptorId: params.id });

	try {
		// Validate ID format
		const { id } = preceptorIdSchema.parse({ id: params.id });

		const result = await generateDatesFromPatterns(db, id);

		log.info('Pattern dates generated', {
			preceptorId: id,
			dateCount: result.dates?.length || 0,
			patternCount: result.patterns?.length || 0
		});

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Pattern generation validation failed', {
				preceptorId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Preceptor not found for pattern generation', { preceptorId: params.id });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to generate pattern dates', { preceptorId: params.id, error });
		return handleApiError(error);
	}
};
