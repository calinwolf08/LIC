/**
 * Students API - Collection Endpoints
 *
 * GET /api/students - List all students
 * POST /api/students - Create new student
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse,
	errorResponse,
	handleApiError
} from '$lib/api/responses';
import { ConflictError } from '$lib/api/errors';
import { getStudents, createStudent } from '$lib/features/students/services/student-service';
import { createStudentSchema } from '$lib/features/students/schemas';
import { ZodError } from 'zod';

/**
 * GET /api/students
 * Returns all students ordered by name
 */
export const GET: RequestHandler = async () => {
	try {
		const students = await getStudents(db);
		return successResponse(students);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/students
 * Creates a new student
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const validatedData = createStudentSchema.parse(body);

		const student = await createStudent(db, validatedData);

		return successResponse(student, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			return errorResponse(error.message, 409);
		}

		return handleApiError(error);
	}
};
