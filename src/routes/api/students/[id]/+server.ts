/**
 * Students API - Individual Student Endpoints
 *
 * GET /api/students/[id] - Get single student
 * PATCH /api/students/[id] - Update student
 * DELETE /api/students/[id] - Delete student
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse,
	notFoundResponse
} from '$lib/api/responses';
import { NotFoundError, ConflictError, ValidationError, handleApiError } from '$lib/api/errors';
import {
	getStudentById,
	updateStudent,
	deleteStudent
} from '$lib/features/students/services/student-service.js';
import { updateStudentSchema, studentIdSchema } from '$lib/features/students/schemas.js';
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:students:id');

/**
 * GET /api/students/[id]
 * Returns a single student
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching student', { id: params.id });

	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		const student = await getStudentById(db, id);

		if (!student) {
			log.warn('Student not found', { id });
			return notFoundResponse('Student');
		}

		log.info('Student fetched', { id, name: student.name });
		return successResponse(student);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid student ID format', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to fetch student', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * PATCH /api/students/[id]
 * Updates a student
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	log.debug('Updating student', { id: params.id });

	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateStudentSchema.parse(body);

		const updatedStudent = await updateStudent(db, id, validatedData);

		log.info('Student updated', {
			id,
			name: updatedStudent.name,
			updatedFields: Object.keys(validatedData)
		});

		return successResponse(updatedStudent);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Student update validation failed', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Student not found for update', { id: params.id });
			return notFoundResponse('Student');
		}

		if (error instanceof ConflictError) {
			log.warn('Student update conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to update student', { id: params.id, error });
		return handleApiError(error);
	}
};

/**
 * DELETE /api/students/[id]
 * Deletes a student
 */
export const DELETE: RequestHandler = async ({ params }) => {
	log.debug('Deleting student', { id: params.id });

	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		await deleteStudent(db, id);

		log.info('Student deleted', { id });
		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Invalid student ID format for deletion', {
				id: params.id,
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			log.warn('Student not found for deletion', { id: params.id });
			return notFoundResponse('Student');
		}

		if (error instanceof ConflictError) {
			log.warn('Student deletion conflict', { id: params.id, message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to delete student', { id: params.id, error });
		return handleApiError(error);
	}
};
