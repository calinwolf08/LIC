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
	errorResponse
} from '$lib/api/responses';
import { ConflictError, handleApiError } from '$lib/api/errors';
import { getStudentsWithOnboardingStats, createStudent } from '$lib/features/students/services/student-service.js';
import { createStudentSchema } from '$lib/features/students/schemas.js';
import { autoAssociateWithActiveSchedule } from '$lib/api/schedule-context';
import { ZodError } from 'zod';

/**
 * GET /api/students
 * Returns all students ordered by name, with onboarding stats
 */
export const GET: RequestHandler = async () => {
	try {
		const students = await getStudentsWithOnboardingStats(db);
		return successResponse(students);
	} catch (error) {
		return handleApiError(error);
	}
};

/**
 * POST /api/students
 * Creates a new student and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json();
		const validatedData = createStudentSchema.parse(body);

		const student = await createStudent(db, validatedData);

		// Auto-associate with user's active schedule
		if (student.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'student', student.id);
		}

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
