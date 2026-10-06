/**
 * Manual planner draft pins (L4).
 *
 * GET    /api/schedules/plan/pins   — list the caller's draft pins for the active schedule
 * POST   /api/schedules/plan/pins   — stage one pin per date
 * DELETE /api/schedules/plan/pins   — discard the whole draft
 *
 * Pins are tentative and never touch the real schedule; they are scoped to
 * (active schedule, current user). Committing them is a separate endpoint.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { isApiError } from '$lib/api/errors';
import { listPins, addPins, clearPins } from '$lib/features/schedules/services/plan-service';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-plan-pins');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const addSchema = z.object({
	student_id: z.string().min(1),
	kind: z.enum(['clinical', 'free_day', 'exam']).optional(),
	preceptor_id: z.string().min(1).nullish(),
	clerkship_id: z.string().min(1).nullish(),
	site_id: z.string().min(1).nullish(),
	elective_id: z.string().min(1).nullish(),
	dates: z.array(z.string().regex(DATE)).min(1),
	session: z.enum(['full', 'am', 'pm']).optional(),
	credit_value: z.number().positive().max(10).optional(),
	override_codes: z.array(z.string()).optional(),
	override_note: z.string().max(1000).nullish()
});

export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);
	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return successResponse({ pins: [] });
	const pins = await listPins(db, scheduleId, userId);
	return successResponse({ pins });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);
	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	try {
		const input = addSchema.parse(body);
		const kind = input.kind ?? 'clinical';
		if (kind === 'clinical' && !input.preceptor_id) return errorResponse('Select a preceptor', 400);
		if (kind === 'clinical' && !input.site_id) return errorResponse('Select a site', 400);

		// Ownership: every referenced entity must be in the caller's schedule.
		await assertEntityInSchedule(db, scheduleId, 'student', input.student_id);
		if (kind === 'clinical') {
			await assertEntityInSchedule(db, scheduleId, 'preceptor', input.preceptor_id!);
			if (input.clerkship_id)
				await assertEntityInSchedule(db, scheduleId, 'clerkship', input.clerkship_id);
			await assertEntityInSchedule(db, scheduleId, 'site', input.site_id!);
		}

		const pins = await addPins(db, scheduleId, userId, {
			student_id: input.student_id,
			preceptor_id: input.preceptor_id ?? null,
			clerkship_id: input.clerkship_id ?? null,
			site_id: input.site_id ?? null,
			elective_id: input.elective_id ?? null,
			dates: input.dates,
			session: input.session,
			kind,
			credit_value: input.credit_value,
			override_codes: input.override_codes,
			override_note: input.override_note
		});
		return successResponse({ pins }, 201);
	} catch (err) {
		if (err instanceof z.ZodError) return errorResponse('Invalid request', 400, err.issues);
		if (isApiError(err)) return errorResponse(err.message, err.status, err.details);
		log.error('Failed to add plan pins', { error: err });
		return errorResponse('Failed to add pins', 500);
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);
	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return successResponse({ cleared: 0 });
	const cleared = await clearPins(db, scheduleId, userId);
	return successResponse({ cleared });
};
