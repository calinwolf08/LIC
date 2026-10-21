/**
 * POST /api/schedules/plan/options — which planner choices are valid (planner feedback).
 *
 * Takes the planner's partial selection (any of student, type, clerkship, preceptor,
 * site, dates, session) and returns every picker's options annotated with whether
 * they work alongside the rest of the selection, the existing schedule and the
 * caller's other draft pins. See plan-options.ts for the rules.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import {
	computePlanOptions,
	loadPlanOptionsInputs
} from '$lib/features/schedules/services/plan-options';
import { createServerLogger } from '$lib/utils/logger.server';
import { z } from 'zod';

const log = createServerLogger('api:schedules-plan-options');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const selectionSchema = z.object({
	studentId: z.string().min(1).nullish(),
	kind: z.enum(['clinical', 'free_day', 'exam']).optional(),
	clerkshipId: z.string().min(1).nullish(),
	preceptorId: z.string().min(1).nullish(),
	siteId: z.string().min(1).nullish(),
	// A range is expanded client-side; a year of weekdays is the realistic ceiling.
	dates: z.array(z.string().regex(DATE)).max(400).optional(),
	session: z.enum(['full', 'am', 'pm']).optional()
});

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
	const parsed = selectionSchema.safeParse(body);
	if (!parsed.success) return errorResponse('Invalid selection', 400);

	try {
		const inputs = await loadPlanOptionsInputs(db, scheduleId, userId);
		return successResponse(computePlanOptions(inputs, parsed.data));
	} catch (err) {
		log.error('Failed to compute plan options', { error: err });
		return errorResponse('Failed to compute plan options', 500);
	}
};
