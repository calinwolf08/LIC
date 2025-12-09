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
import { z, ZodError } from 'zod';

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
	try {
		const body = await request.json();
		const { date } = conflictCheckSchema.parse(body);

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

		return successResponse(result);
	} catch (error) {
		if (error instanceof ZodError) {
			return validationErrorResponse(error);
		}
		return handleApiError(error);
	}
};
