/**
 * GET /api/schedules/assignments/requirement-preview (Step 17)
 *
 * ?studentId&clerkshipId&count — projects the effect of assigning `count` more
 * days, powering the dialog's "2 of 3 remaining" strip and the amber
 * over-assignment warning.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { previewRequirementImpact } from '$lib/features/scheduling/services/requirement-preview';
import { cuid2Schema } from '$lib/validation/common-schemas';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:schedules-assignments-requirement-preview');

export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return errorResponse('Not authenticated', 401);

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return errorResponse('No active schedule', 400);

	const studentId = url.searchParams.get('studentId');
	const clerkshipId = url.searchParams.get('clerkshipId');
	if (!studentId || !clerkshipId) {
		return errorResponse('studentId and clerkshipId are required', 400);
	}

	const rawCount = url.searchParams.get('count');
	const count = rawCount === null ? 0 : Number(rawCount);
	if (!Number.isFinite(count) || count < 0) {
		return errorResponse('count must be a non-negative number', 400);
	}

	// Edit mode: exclude the edited assignment so its day isn't double-counted.
	const rawExcludeId = url.searchParams.get('excludeId');
	let excludeId: string | null = null;
	if (rawExcludeId) {
		const parsed = cuid2Schema.safeParse(rawExcludeId);
		if (!parsed.success) return errorResponse('excludeId must be a valid id', 400);
		excludeId = parsed.data;
	}

	try {
		const impact = await previewRequirementImpact(
			db,
			scheduleId,
			studentId,
			clerkshipId,
			count,
			undefined,
			excludeId
		);
		return successResponse(impact);
	} catch (err) {
		log.error('Failed to preview requirement impact', { error: err });
		return errorResponse('Failed to load requirement preview', 500);
	}
};
