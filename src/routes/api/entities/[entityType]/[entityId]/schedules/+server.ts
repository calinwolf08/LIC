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
	try {
		const { entityType, entityId } = params;

		// Validate entity type
		if (!VALID_ENTITY_TYPES.includes(entityType as ScheduleEntityType)) {
			return errorResponse(`Invalid entity type: ${entityType}`, 400);
		}

		// Get schedules for this entity
		const schedules = await getSchedulesForEntity(
			db,
			entityType as ScheduleEntityType,
			entityId
		);

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
		return handleApiError(error);
	}
};
