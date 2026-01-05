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
import { createServerLogger } from '$lib/utils/logger.server';
import { sql } from 'kysely';

const log = createServerLogger('api:student-onboarding');

/**
 * GET /api/student-onboarding
 * Returns all student health system onboarding records
 */
export const GET: RequestHandler = async () => {
	log.debug('Fetching all student onboarding records');

	try {
		const records = await db
			.selectFrom('student_health_system_onboarding')
			.selectAll()
			.execute();

		log.info('Student onboarding records fetched', { count: records.length });
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
export const PUT: RequestHandler = async ({ request }) => {
	log.debug('Upserting student onboarding record');

	try {
		const body = await request.json();
		const { student_id, health_system_id, is_completed, completed_date } = body;

		if (!student_id || !health_system_id) {
			log.warn('Missing required fields for onboarding upsert');
			return errorResponse('student_id and health_system_id are required', 400);
		}

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
