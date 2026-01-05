/**
 * Student Completion Stats API
 *
 * GET /api/students/completion-stats - Get completion stats for all students
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, handleApiError } from '$lib/api';
import { createServerLogger } from '$lib/utils/logger.server';
import { sql } from 'kysely';

const log = createServerLogger('api:students:completion-stats');

interface CompletionStats {
	scheduledDays: number;
	requiredDays: number;
	percentage: number;
}

/**
 * GET /api/students/completion-stats
 * Returns completion stats for all students
 */
export const GET: RequestHandler = async () => {
	log.debug('Calculating student completion stats');

	try {
		// Get all students
		const students = await db.selectFrom('students').select('id').execute();

		// Get total required days from clerkships
		const clerkships = await db
			.selectFrom('clerkships')
			.select('required_days')
			.execute();

		const totalRequiredDays = clerkships.reduce((sum, c) => sum + (c.required_days || 0), 0);

		// Get scheduled days per student
		const assignmentCounts = await db
			.selectFrom('schedule_assignments')
			.select(['student_id', sql<number>`count(*)`.as('count')])
			.groupBy('student_id')
			.execute();

		// Build stats map
		const statsMap: Record<string, CompletionStats> = {};

		// Initialize all students with zero
		for (const student of students) {
			if (student.id) {
				statsMap[student.id] = {
					scheduledDays: 0,
					requiredDays: totalRequiredDays,
					percentage: 0
				};
			}
		}

		// Update with actual assignment counts
		for (const assignment of assignmentCounts) {
			if (assignment.student_id && statsMap[assignment.student_id]) {
				const scheduledDays = Number(assignment.count);
				statsMap[assignment.student_id] = {
					scheduledDays,
					requiredDays: totalRequiredDays,
					percentage: totalRequiredDays > 0
						? Math.round((scheduledDays / totalRequiredDays) * 100)
						: 0
				};
			}
		}

		log.info('Student completion stats calculated', {
			studentCount: students.length,
			totalRequiredDays,
			studentsWithAssignments: assignmentCounts.length
		});

		return successResponse(statsMap);
	} catch (error) {
		log.error('Failed to calculate completion stats', { error });
		return handleApiError(error);
	}
};
