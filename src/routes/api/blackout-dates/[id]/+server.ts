/**
 * Blackout Dates API - Individual Resource Endpoints
 *
 * GET /api/blackout-dates/[id] - Get single blackout date
 * DELETE /api/blackout-dates/[id] - Delete blackout date
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	notFoundResponse
} from '$lib/api/responses';
import { handleApiError, NotFoundError } from '$lib/api/errors';
import {
	getBlackoutDateById,
	deleteBlackoutDate
} from '$lib/features/blackout-dates/services/blackout-date-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:blackout-dates:id');

/**
 * GET /api/blackout-dates/[id]
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching blackout date', { id: params.id });

	try {
		const blackoutDate = await getBlackoutDateById(db, params.id);

		if (!blackoutDate) {
			log.warn('Blackout date not found', { id: params.id });
			return notFoundResponse('Blackout date');
		}

		log.info('Blackout date fetched', {
			id: params.id,
			date: blackoutDate.date,
			reason: blackoutDate.reason
		});

		return successResponse(blackoutDate);
	} catch (error) {
		log.error('Failed to fetch blackout date', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/blackout-dates/[id]
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting blackout date', { id: params.id });

	try {
		await deleteBlackoutDate(db, params.id);

		log.info('Blackout date deleted', { id: params.id });
		return successResponse({ deleted: true });
	} catch (error) {
		if (error instanceof NotFoundError) {
			log.warn('Blackout date not found for deletion', { id: params.id });
			return notFoundResponse('Blackout date');
		}
		log.error('Failed to delete blackout date', { id: params.id, error });
		return handleApiError(error);
	}
};
