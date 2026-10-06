/**
 * A single manual-planner draft pin (L4).
 *
 * PATCH  /api/schedules/plan/pins/[id]  — change a staged pin (preceptor, date, override, …)
 * DELETE /api/schedules/plan/pins/[id]  — remove a staged pin
 *
 * Both are scoped to (active schedule, current user): a caller can only touch their
 * own draft, and only pins in their active schedule.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse, notFoundResponse } from '$lib/api/responses';
import { getActiveScheduleId, assertEntityInSchedule } from '$lib/api/schedule-context';
import { isApiError } from '$lib/api/errors';
import { updatePin, deletePin } from '$lib/features/schedules/services/plan-service';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-plan-pin');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const patchSchema = z.object({
	preceptor_id: z.string().min(1).nullish(),
	clerkship_id: z.string().min(1).nullish(),
	site_id: z.string().min(1).nullish(),
	elective_id: z.string().min(1).nullish(),
	date: z.string().regex(DATE).optional(),
	session: z.enum(['full', 'am', 'pm']).optional(),
	kind: z.enum(['clinical', 'free_day', 'exam']).optional(),
	credit_value: z.number().positive().max(10).optional(),
	override_codes: z.array(z.string()).optional(),
	override_note: z.string().max(1000).nullish()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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
		const patch = patchSchema.parse(body);
		// Guard any entity the patch newly points at.
		if (patch.preceptor_id) await assertEntityInSchedule(db, scheduleId, 'preceptor', patch.preceptor_id);
		if (patch.clerkship_id) await assertEntityInSchedule(db, scheduleId, 'clerkship', patch.clerkship_id);
		if (patch.site_id) await assertEntityInSchedule(db, scheduleId, 'site', patch.site_id);

		const pin = await updatePin(db, scheduleId, userId, params.id, patch);
		if (!pin) return notFoundResponse('Pin');
		return successResponse({ pin });
	} catch (err) {
		if (err instanceof z.ZodError) return errorResponse('Invalid request', 400, err.issues);
		if (isApiError(err)) return errorResponse(err.message, err.status, err.details);
		log.error('Failed to update plan pin', { error: err });
		return errorResponse('Failed to update pin', 500);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);
	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	const removed = await deletePin(db, scheduleId, userId, params.id);
	if (!removed) return notFoundResponse('Pin');
	return successResponse({ deleted: true });
};
