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
import { createServerLogger } from '$lib/utils/logger.server';
import { ZodError } from 'zod';

const log = createServerLogger('api:students');

/**
 * GET /api/students
 * Returns all students ordered by name, with onboarding stats
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching all students');

	try {
		const students = await getStudentsWithOnboardingStats(db);

		log.info('Students fetched', { count: students.length });
		return successResponse(students);
	} catch (error) {
		log.error('Failed to fetch students', { error });
		return handleApiError(error);
	}
};

/**
 * POST /api/students
 * Creates a new student and auto-associates with user's active schedule
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	log.debug('Creating student');

	try {
		const body = await request.json();
		const validatedData = createStudentSchema.parse(body);

		const student = await createStudent(db, validatedData);

		// Auto-associate with user's active schedule
		if (student.id) {
			await autoAssociateWithActiveSchedule(db, locals.session?.user?.id, 'student', student.id);
		}

		log.info('Student created', {
			id: student.id,
			name: student.name,
			email: student.email
		});

		return successResponse(student, 201);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Student validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		if (error instanceof ConflictError) {
			log.warn('Student conflict', { message: error.message });
			return errorResponse(error.message, 409);
		}

		log.error('Failed to create student', { error });
		return handleApiError(error);
	}
};
