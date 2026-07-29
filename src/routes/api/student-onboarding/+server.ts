/**
 * Student Onboarding API
 *
 * GET /api/student-onboarding - Get all student health system onboarding records
 * PUT /api/student-onboarding - Upsert a single onboarding record
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { createServerLogger } from '$lib/utils/logger.server';
import { sql } from 'kysely';

const log = createServerLogger('api:student-onboarding');

/**
 * GET /api/student-onboarding
 * Returns onboarding records for students in the caller's active schedule.
 */
export const GET: RequestHandler = async ({ locals }) => {
	log.debug('Fetching student onboarding records for active schedule');

	try {
		const scheduleId = await requireActiveScheduleId(locals);

		// Scope to this schedule's students — a bare select leaks every tenant's
		// onboarding rows.
		const records = await db
			.selectFrom('student_health_system_onboarding as o')
			.innerJoin('schedule_students as ss', (join) =>
				join.onRef('ss.student_id', '=', 'o.student_id').on('ss.schedule_id', '=', scheduleId)
			)
			.selectAll('o')
			.execute();

		log.info('Student onboarding records fetched', { count: records.length, scheduleId });
		return successResponse(records);
	} catch (error) {
		log.error('Failed to fetch student onboarding records', { error });
		return handleApiError(error);
	}
};

/**
 * PUT /api/student-onboarding
 * Upsert a single onboarding record
 *
 * Body: { student_id, health_system_id, is_completed, completed_date? }
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	log.debug('Upserting student onboarding record');

	try {
		const body = await request.json();
		const { student_id, health_system_id, is_completed, completed_date } = body;

		if (!student_id || !health_system_id) {
			log.warn('Missing required fields for onboarding upsert');
			return errorResponse('student_id and health_system_id are required', 400);
		}

		// Ownership guard: the student and the health system must both be in the
		// caller's schedule before we write an onboarding row.
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'student', student_id);
		await assertEntityInSchedule(db, scheduleId, 'health_system', health_system_id);

		log.debug('Processing onboarding upsert', {
			studentId: student_id,
			healthSystemId: health_system_id,
			isCompleted: is_completed
		});

		const now = new Date().toISOString();

		// Check if record exists
		const existing = await db
			.selectFrom('student_health_system_onboarding')
			.select('id')
			.where('student_id', '=', student_id)
			.where('health_system_id', '=', health_system_id)
			.executeTakeFirst();

		if (existing) {
			// Update existing record
			await db
				.updateTable('student_health_system_onboarding')
				.set({
					is_completed: is_completed ? 1 : 0,
					completed_date: is_completed ? (completed_date || now.split('T')[0]) : null,
					updated_at: now
				})
				.where('id', '=', existing.id)
				.execute();

			log.info('Student onboarding record updated', {
				studentId: student_id,
				healthSystemId: health_system_id,
				isCompleted: is_completed
			});
		} else {
			// Create new record
			await db
				.insertInto('student_health_system_onboarding')
				.values({
					id: crypto.randomUUID(),
					student_id,
					health_system_id,
					is_completed: is_completed ? 1 : 0,
					completed_date: is_completed ? (completed_date || now.split('T')[0]) : null,
					notes: null,
					created_at: now,
					updated_at: now
				})
				.execute();

			log.info('Student onboarding record created', {
				studentId: student_id,
				healthSystemId: health_system_id,
				isCompleted: is_completed
			});
		}

		return successResponse({ success: true });
	} catch (error) {
		log.error('Failed to upsert student onboarding record', { error });
		return handleApiError(error);
	}
};
