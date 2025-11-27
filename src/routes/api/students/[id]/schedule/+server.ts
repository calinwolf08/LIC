/**
 * Student Schedule API
 *
 * GET /api/students/[id]/schedule - Get student's schedule with progress breakdown
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, notFoundResponse, handleApiError } from '$lib/api';
import { getStudentScheduleData } from '$lib/features/schedules/services/schedule-views-service';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:student-schedule');

/**
 * GET /api/students/[id]/schedule
 * Returns student's complete schedule with clerkship progress
 */
export const GET: RequestHandler = async ({ params }) => {
	log.debug('Fetching student schedule', { studentId: params.id });

	try {
		const schedule = await getStudentScheduleData(db, params.id);

		if (!schedule) {
			log.warn('Student not found', { studentId: params.id });
			return notFoundResponse('Student');
		}

		log.info('Student schedule fetched', {
			studentId: params.id,
			totalAssignments: schedule.assignments.length,
			clerkshipsComplete: schedule.summary.clerkshipsComplete
		});

		return successResponse(schedule);
	} catch (error) {
		log.error('Failed to fetch student schedule', { studentId: params.id, error });
		return handleApiError(error);
	}
};
