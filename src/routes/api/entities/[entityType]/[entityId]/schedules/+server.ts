/**
 * Entity Schedules API - Get schedules containing an entity
 *
 * GET /api/entities/:entityType/:entityId/schedules
 * Returns list of schedules that contain this entity
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import {
	getSchedulesForEntity,
	type ScheduleEntityType
} from '$lib/features/scheduling/services/scheduling-period-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:entities:schedules');

const VALID_ENTITY_TYPES: ScheduleEntityType[] = [
	'students',
	'preceptors',
	'sites',
	'health_systems',
	'clerkships',
	'teams'
];

/**
 * GET /api/entities/:entityType/:entityId/schedules
 * Returns all schedules that contain the specified entity
 */
export const GET: RequestHandler = async ({ params }) => {
	const { entityType, entityId } = params;

	log.debug('Fetching schedules for entity', { entityType, entityId });

	try {
		// Validate entity type
		if (!VALID_ENTITY_TYPES.includes(entityType as ScheduleEntityType)) {
			log.warn('Invalid entity type requested', { entityType, entityId });
			return errorResponse(`Invalid entity type: ${entityType}`, 400);
		}

		// Get schedules for this entity
		const schedules = await getSchedulesForEntity(
			db,
			entityType as ScheduleEntityType,
			entityId
		);

		log.info('Schedules for entity fetched', {
			entityType,
			entityId,
			scheduleCount: schedules.length,
			isShared: schedules.length > 1
		});

		return successResponse({
			schedules: schedules.map((s) => ({
				id: s.id,
				name: s.name,
				startDate: s.start_date,
				endDate: s.end_date,
				isActive: s.is_active === 1
			})),
			count: schedules.length,
			isShared: schedules.length > 1
		});
	} catch (error) {
		log.error('Failed to fetch schedules for entity', { entityType, entityId, error });
		return handleApiError(error);
	}
};
