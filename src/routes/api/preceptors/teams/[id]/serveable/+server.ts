/**
 * Team serveable-clerkships API (client feedback G3/G4)
 *
 * GET /api/preceptors/teams/[id]/serveable
 * Returns the clerkships every member can serve (inferred from availability) and
 * whether the members overlap at all.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getActiveScheduleId } from '$lib/api/schedule-context';
import { getTeamServeableClerkships } from '$lib/features/scheduling/eligibility/eligibility';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:preceptors:teams:serveable');

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const userId = locals.session?.user?.id;
		if (!userId) return errorResponse('Authentication required', 401);
		const scheduleId = await getActiveScheduleId(userId);
		if (!scheduleId) return errorResponse('No active schedule', 400);

		const members = await db
			.selectFrom('preceptor_team_members')
			.select('preceptor_id')
			.where('team_id', '=', params.id)
			.execute();

		const result = await getTeamServeableClerkships(
			db,
			scheduleId,
			members.map((m) => m.preceptor_id)
		);

		log.info('Team serveability computed', {
			teamId: params.id,
			serveable: result.serveable.length,
			overlap: result.overlap
		});
		return successResponse(result);
	} catch (error) {
		return handleApiError(error);
	}
};
