/**
 * Scheduling Period Activation API
 *
 * POST /api/scheduling-periods/[id]/activate - Activate a scheduling period
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse
} from '$lib/api/responses';
import { NotFoundError, handleApiError } from '$lib/api/errors';
import { activateSchedulingPeriod } from '$lib/features/scheduling/services/scheduling-period-service';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:scheduling-periods:activate');

/**
 * POST /api/scheduling-periods/[id]/activate
 * Activate a scheduling period (deactivates all others)
 */
export const POST: RequestHandler = async ({ params }) => {
	log.debug('Activating scheduling period', { periodId: params.id });

	try {
		const id = cuid2Schema.parse(params.id);

		const period = await activateSchedulingPeriod(db, id);

		log.info('Scheduling period activated', {
			periodId: id,
			name: period.name,
			startDate: period.start_date,
			endDate: period.end_date
		});

		return successResponse(period);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Validation failed for activate', {
				periodId: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Scheduling period not found for activation', { periodId: params.id });
			return errorResponse(error.message, 404);
		}

		log.error('Failed to activate scheduling period', { periodId: params.id, error });
		return handleApiError(error);
	}
};
