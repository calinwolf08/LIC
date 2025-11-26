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
import { sql } from 'kysely';

/**
 * GET /api/student-onboarding
 * Returns all student health system onboarding records
 */
export const GET: RequestHandler = async () => {
	try {
		const records = await db
			.selectFrom('student_health_system_onboarding')
			.selectAll()
			.execute();

		return successResponse(records);
	} catch (error) {
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
	try {
		const body = await request.json();
		const { student_id, health_system_id, is_completed, completed_date } = body;

		if (!student_id || !health_system_id) {
			return errorResponse('student_id and health_system_id are required', 400);
		}

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
		}

		return successResponse({ success: true });
	} catch (error) {
		return handleApiError(error);
	}
};
