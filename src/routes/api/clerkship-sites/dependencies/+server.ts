/**
 * Clerkship-Site Dependencies API
 *
 * GET /api/clerkship-sites/dependencies
 * Check if any teams depend on a clerkship-site association.
 * Used to prevent removing a site from a clerkship if teams would be affected.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse, errorResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';

/**
 * GET /api/clerkship-sites/dependencies
 * Returns teams that depend on the specified clerkship-site association.
 *
 * A team depends on a site if:
 * 1. The team belongs to the clerkship
 * 2. The team has members (preceptors) who work at that site
 *
 * Query params:
 * - clerkship_id: The clerkship ID
 * - site_id: The site ID
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clerkshipId = url.searchParams.get('clerkship_id');
		const siteId = url.searchParams.get('site_id');

		if (!clerkshipId || !siteId) {
			return errorResponse('Both clerkship_id and site_id parameters are required', 400);
		}

		// Find teams that:
		// 1. Belong to this clerkship
		// 2. Have members (preceptors) who work at this site (via preceptor_sites junction table)
		const dependentTeams = await db
			.selectFrom('preceptor_teams')
			.innerJoin('preceptor_team_members', 'preceptor_teams.id', 'preceptor_team_members.team_id')
			.innerJoin('preceptor_sites', 'preceptor_team_members.preceptor_id', 'preceptor_sites.preceptor_id')
			.select(['preceptor_teams.id as teamId', 'preceptor_teams.name as teamName'])
			.where('preceptor_teams.clerkship_id', '=', clerkshipId)
			.where('preceptor_sites.site_id', '=', siteId)
			.groupBy('preceptor_teams.id')
			.execute();

		return successResponse(
			dependentTeams.map((t) => ({
				teamId: t.teamId,
				teamName: t.teamName || 'Unnamed Team'
			}))
		);
	} catch (error) {
		return handleApiError(error);
	}
};
