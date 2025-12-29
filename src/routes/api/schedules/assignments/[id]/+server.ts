/**
 * Schedule Assignment API - Individual Assignment Endpoints
 *
 * GET /api/schedules/assignments/[id] - Get single assignment
 * PATCH /api/schedules/assignments/[id] - Update assignment
 * DELETE /api/schedules/assignments/[id] - Delete assignment
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { NotFoundError, ValidationError, handleApiError } from '$lib/api/errors';
import {
	getAssignmentById,
	updateAssignment,
	deleteAssignment
} from '$lib/features/schedules/services/assignment-service.js';
import { assignmentIdSchema, updateAssignmentSchema } from '$lib/features/schedules/schemas.js';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:schedules:assignments:id');

/**
 * GET /api/schedules/assignments/[id]
 * Returns a single assignment
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching assignment', { id: params.id });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		const assignment = await getAssignmentById(db, id);

		if (!assignment) {
			log.warn('Assignment not found', { id });
			return notFoundResponse('Assignment');
		}

		log.info('Assignment fetched', {
			id,
			studentId: assignment.student_id,
			preceptorId: assignment.preceptor_id,
			date: assignment.date
		});

		return successResponse(assignment);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid assignment ID format', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch assignment', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/schedules/assignments/[id]
 * Updates an assignment
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating assignment', { id: params.id });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });
		const body = await request.json();
		const updates = updateAssignmentSchema.parse(body);

		const updated = await updateAssignment(db, id, updates);

		log.info('Assignment updated', {
			id,
			updatedFields: Object.keys(updates),
			preceptorId: updated.preceptor_id,
			date: updated.date
		});

		return successResponse(updated);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Assignment update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment not found for update', { id: params.id });
			return notFoundResponse('Assignment');
		}

		if (error instanceof ValidationError) {
			log.warn('Assignment update validation error', {
				id: params.id,
				message: error.message
			});
			return validationErrorResponse(new ZodError([
				{
					code: 'custom',
					path: [],
					message: error.message
				}
			]));
		}

		log.error('Failed to update assignment', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/schedules/assignments/[id]
 * Deletes an assignment
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting assignment', { id: params.id });

	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		await deleteAssignment(db, id);

		log.info('Assignment deleted', { id });
		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid assignment ID format for deletion', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Assignment not found for deletion', { id: params.id });
			return notFoundResponse('Assignment');
		}

		log.error('Failed to delete assignment', { id: params.id, error });
		return handleApiError(error);
	}
};
