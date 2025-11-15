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
	notFoundResponse,
	handleApiError
} from '$lib/api/responses';
import { NotFoundError, ConflictError, ValidationError } from '$lib/api/errors';
import {
	getStudentById,
	updateStudent,
	deleteStudent
} from '$lib/features/students/services/student-service';
import { updateStudentSchema, studentIdSchema } from '$lib/features/students/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/students/[id]
 * Returns a single student
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		const student = await getStudentById(db, id);

		if (!student) {
			return notFoundResponse('Student');
		}

		return successResponse(student);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		return handleApiError(error);
	}
};

/**
 * PATCH /api/students/[id]
 * Updates a student
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		// Parse and validate request body
		const body = await request.json();
		const validatedData = updateStudentSchema.parse(body);

		const updatedStudent = await updateStudent(db, id, validatedData);

		return successResponse(updatedStudent);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Student');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};

/**
 * DELETE /api/students/[id]
 * Deletes a student
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		// Validate ID format
		const { id } = studentIdSchema.parse({ id: params.id });

		await deleteStudent(db, id);

		return successResponse(null);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof NotFoundError) {
			return notFoundResponse('Student');
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
