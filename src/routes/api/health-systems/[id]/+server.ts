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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:health-systems:id');
const service = new HealthSystemService(db);

/**
 * GET /api/health-systems/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching health system', { id: params.id });

	try {
		const result = await service.getHealthSystem(params.id);

		if (!result.success || !result.data) {
			log.warn('Health system not found', { id: params.id });
			return notFoundResponse('Health system');
		}

		log.info('Health system fetched', {
			id: params.id,
			name: result.data.name,
			location: result.data.location
		});

		return successResponse(result.data);
	} catch (error) {
		log.error('Failed to fetch health system', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/health-systems/[id]
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	log.debug('Updating health system', { id: params.id });

	try {
		const body = await request.json();
		const validatedData = healthSystemInputSchema.parse(body);

		const result = await service.updateHealthSystem(params.id, validatedData);

		if (!result.success) {
			log.warn('Health system update failed', {
				id: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Health system updated', {
			id: params.id,
			name: result.data.name,
			updatedFields: Object.keys(validatedData)
		});

		return successResponse(result.data);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Health system update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to update health system', { id: params.id, error });
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
	log.debug('Deleting health system', { id: params.id });

	try {
		// Check dependencies first
		const dependencies = await service.getHealthSystemDependencies(params.id);

		if (dependencies.sites.length > 0) {
			log.debug('Health system has dependencies', {
				id: params.id,
				siteCount: dependencies.sites.length
			});
		}

		const result = await service.deleteHealthSystem(params.id);

		if (!result.success) {
			log.warn('Health system deletion failed', {
				id: params.id,
				error: result.error.message
			});
			return errorResponse(result.error.message, 400);
		}

		log.info('Health system deleted', { id: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		log.error('Failed to delete health system', { id: params.id, error });
		return handleApiError(error);
	}
};
