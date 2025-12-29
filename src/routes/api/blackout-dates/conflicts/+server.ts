/**
 * Blackout Dates API - Conflict Detection
 *
 * POST /api/blackout-dates/conflicts - Check if a date has existing assignments
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import {
	successResponse,
	validationErrorResponse
} from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { dateStringSchema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:blackout-dates:conflicts');

const conflictCheckSchema = z.object({
	date: dateStringSchema
});

interface ConflictInfo {
	hasConflicts: boolean;
	count: number;
	assignments: Array<{
		id: string | null;
		studentId: string;
		studentName: string;
		preceptorId: string;
		preceptorName: string;
		clerkshipId: string;
		clerkshipName: string;
	}>;
}

/**
 * POST /api/blackout-dates/conflicts
 * Checks if a given date has existing schedule assignments
 */
export const POST: RequestHandler = async ({ request }) => {
	log.debug('Checking blackout date conflicts');

	try {
		const body = await request.json();
		const { date } = conflictCheckSchema.parse(body);

		log.debug('Checking conflicts for date', { date });

		// Query assignments for the given date with related info
		const assignments = await db
			.selectFrom('schedule_assignments')
			.innerJoin('students', 'students.id', 'schedule_assignments.student_id')
			.innerJoin('preceptors', 'preceptors.id', 'schedule_assignments.preceptor_id')
			.innerJoin('clerkships', 'clerkships.id', 'schedule_assignments.clerkship_id')
			.select([
				'schedule_assignments.id',
				'schedule_assignments.student_id as studentId',
				'students.name as studentName',
				'schedule_assignments.preceptor_id as preceptorId',
				'preceptors.name as preceptorName',
				'schedule_assignments.clerkship_id as clerkshipId',
				'clerkships.name as clerkshipName'
			])
			.where('schedule_assignments.date', '=', date)
			.execute();

		const result: ConflictInfo = {
			hasConflicts: assignments.length > 0,
			count: assignments.length,
			assignments: assignments.map(a => ({
				id: a.id,
				studentId: a.studentId,
				studentName: a.studentName,
				preceptorId: a.preceptorId,
				preceptorName: a.preceptorName,
				clerkshipId: a.clerkshipId,
				clerkshipName: a.clerkshipName
			}))
		};

		log.info('Blackout date conflicts checked', {
			date,
			hasConflicts: result.hasConflicts,
			conflictCount: result.count
		});

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			log.warn('Conflict check validation failed', {
				errors: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
			});
			return validationErrorResponse(error);
		}

		log.error('Failed to check blackout date conflicts', { error });
		return handleApiError(error);
	}
};
