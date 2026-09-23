/**
 * Student Core Preceptors API (client feedback F5)
 *
 * GET  /api/students/[id]/core-preceptors - list the student's core preceptor ids
 * PUT  /api/students/[id]/core-preceptors - replace the student's core preceptor set
 *
 * Core preceptors are a student's continuity preceptors; assigning the student
 * outside this set raises the soft `outside_core_preceptor` warning.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { requireActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { studentIdSchema } from '$lib/features/students/schemas.js';
import { createServerLogger } from '$lib/utils/logger.server';
import { nanoid } from 'nanoid';
import { z, ZodError } from 'zod';

const log = createServerLogger('api:students:core-preceptors');

const putSchema = z.object({ preceptor_ids: z.array(z.string()).default([]) });

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { id } = studentIdSchema.parse({ id: params.id });
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'student', id);

		const rows = await db
			.selectFrom('student_core_preceptors')
			.select('preceptor_id')
			.where('student_id', '=', id)
			.execute();

		return successResponse({ preceptor_ids: rows.map((r) => r.preceptor_id) });
	} catch (error) {
		if (error instanceof ZodError) return errorResponse('Invalid student id', 400);
		return handleApiError(error);
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { id } = studentIdSchema.parse({ id: params.id });
		const scheduleId = await requireActiveScheduleId(locals);
		await assertEntityInSchedule(db, scheduleId, 'student', id);

		const { preceptor_ids } = putSchema.parse(await request.json());
		const unique = [...new Set(preceptor_ids)];

		// Every core preceptor must be a preceptor in the caller's active schedule
		// (tenant boundary + only real, in-scope preceptors).
		for (const preceptorId of unique) {
			await assertEntityInSchedule(db, scheduleId, 'preceptor', preceptorId);
		}

		await db.transaction().execute(async (trx) => {
			await trx
				.deleteFrom('student_core_preceptors')
				.where('student_id', '=', id)
				.execute();
			if (unique.length > 0) {
				await trx
					.insertInto('student_core_preceptors')
					.values(
						unique.map((preceptorId) => ({
							id: nanoid(),
							student_id: id,
							preceptor_id: preceptorId
						}))
					)
					.execute();
			}
		});

		log.info('Core preceptors updated', { studentId: id, count: unique.length });
		return successResponse({ preceptor_ids: unique });
	} catch (error) {
		if (error instanceof ZodError) return errorResponse('Invalid request', 400);
		return handleApiError(error);
	}
};
