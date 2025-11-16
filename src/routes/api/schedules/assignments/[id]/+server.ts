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
	notFoundResponse,
	handleApiError
} from '$lib/api/responses';
import { NotFoundError, ValidationError } from '$lib/api/errors';
import {
	getAssignmentById,
	updateAssignment,
	deleteAssignment
} from '$lib/features/schedules/services/assignment-service';
import { assignmentIdSchema, updateAssignmentSchema } from '$lib/features/schedules/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/schedules/assignments/[id]
 * Returns a single assignment
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		const assignment = await getAssignmentById(db, id);

		if (!assignment) {
			return notFoundResponse('Assignment');
		}

		return successResponse(assignment);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/schedules/assignments/[id]
 * Updates an assignment
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });
		const body = await request.json();
		const updates = updateAssignmentSchema.parse(body);

		const updated = await updateAssignment(db, id, updates);

		return successResponse(updated);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Assignment');
		}

		if (error instanceof ValidationError) {
			return validationErrorResponse(new ZodError([
				{
					code: 'custom',
					path: [],
					message: error.message
				}
			]));
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/schedules/assignments/[id]
 * Deletes an assignment
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { id } = assignmentIdSchema.parse({ id: params.id });

		await deleteAssignment(db, id);

		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Assignment');
		}

		return handleApiError(error);
	}
};
