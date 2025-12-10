/**
 * Schedule Entities API
 *
 * GET /api/scheduling-periods/[id]/entities - Get entities for a schedule
 * POST /api/scheduling-periods/[id]/entities - Add entities to a schedule
 * DELETE /api/scheduling-periods/[id]/entities - Remove entities from a schedule
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
	getSchedulingPeriodById,
	getScheduleEntities,
	addEntitiesToSchedule,
	removeEntityFromSchedule,
	getScheduleEntityCounts,
	type ScheduleEntityType
} from '$lib/features/scheduling/services/scheduling-period-service';
import {
	scheduleEntityTypeSchema,
	scheduleEntitiesSchema
} from '$lib/features/preceptors/pattern-schemas';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { ZodError } from 'zod';

/**
 * GET /api/scheduling-periods/[id]/entities
 * Get entities associated with a schedule
 *
 * Query params:
 * - type: Entity type (students, preceptors, sites, health_systems, clerkships, teams, configurations)
 *         If not provided, returns counts for all entity types
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const scheduleId = cuid2Schema.parse(params.id);

		// Verify schedule exists
		const schedule = await getSchedulingPeriodById(db, scheduleId);
		if (!schedule) {
			return errorResponse('Schedule not found', 404);
		}

		const entityTypeParam = url.searchParams.get('type');

		if (entityTypeParam) {
			// Get specific entity type
			const entityType = scheduleEntityTypeSchema.parse(entityTypeParam);
			const entityIds = await getScheduleEntities(db, scheduleId, entityType);

			return successResponse({
				scheduleId,
				entityType,
				entityIds,
				count: entityIds.length
			});
		}

		// Get counts for all entity types
		const counts = await getScheduleEntityCounts(db, scheduleId);

		return successResponse({
			scheduleId,
			counts
		});
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * POST /api/scheduling-periods/[id]/entities
 * Add entities to a schedule
 *
 * Body:
 * {
 *   entityType: 'students' | 'preceptors' | 'sites' | 'health_systems' | 'clerkships' | 'teams' | 'configurations',
 *   entityIds: string[]
 * }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const scheduleId = cuid2Schema.parse(params.id);

		// Verify schedule exists
		const schedule = await getSchedulingPeriodById(db, scheduleId);
		if (!schedule) {
			return errorResponse('Schedule not found', 404);
		}

		// Parse and validate request body
		const body = await request.json();
		const { entityType, entityIds } = scheduleEntitiesSchema.parse(body);

		// Add entities to schedule
		await addEntitiesToSchedule(db, scheduleId, entityType as ScheduleEntityType, entityIds);

		// Get updated count
		const updatedEntityIds = await getScheduleEntities(db, scheduleId, entityType as ScheduleEntityType);

		return successResponse({
			scheduleId,
			entityType,
			addedCount: entityIds.length,
			totalCount: updatedEntityIds.length,
			message: `Added ${entityIds.length} ${entityType} to schedule`
		});
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
 * DELETE /api/scheduling-periods/[id]/entities
 * Remove entities from a schedule
 *
 * Body:
 * {
 *   entityType: 'students' | 'preceptors' | 'sites' | 'health_systems' | 'clerkships' | 'teams' | 'configurations',
 *   entityIds: string[]
 * }
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const scheduleId = cuid2Schema.parse(params.id);

		// Verify schedule exists
		const schedule = await getSchedulingPeriodById(db, scheduleId);
		if (!schedule) {
			return errorResponse('Schedule not found', 404);
		}

		// Parse and validate request body
		const body = await request.json();
		const { entityType, entityIds } = scheduleEntitiesSchema.parse(body);

		// Remove entities from schedule
		for (const entityId of entityIds) {
			await removeEntityFromSchedule(db, scheduleId, entityType as ScheduleEntityType, entityId);
		}

		// Get updated count
		const remainingEntityIds = await getScheduleEntities(db, scheduleId, entityType as ScheduleEntityType);

		return successResponse({
			scheduleId,
			entityType,
			removedCount: entityIds.length,
			remainingCount: remainingEntityIds.length,
			message: `Removed ${entityIds.length} ${entityType} from schedule`
		});
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
