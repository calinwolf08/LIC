/**
 * Available Preceptors API
 *
 * GET /api/preceptors/teams/available-preceptors - Get preceptors filtered by site IDs
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { successResponse } from '$lib/api/responses';
import { handleApiError } from '$lib/api/errors';
import { getPreceptorsBySites } from '$lib/features/preceptors/services/preceptor-service.js';

/**
 * GET /api/preceptors/teams/available-preceptors
 * Returns preceptors filtered by site IDs
 * Query param: siteIds (comma-separated list of site IDs)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const siteIdsParam = url.searchParams.get('siteIds');
		const siteIds = siteIdsParam ? siteIdsParam.split(',').filter(Boolean) : [];

		const preceptors = await getPreceptorsBySites(db, siteIds);

		// Enhance preceptors with their site associations
		const preceptorsWithSites = await Promise.all(
			preceptors.map(async (p) => {
				const sites = await db
					.selectFrom('preceptor_sites')
					.innerJoin('sites', 'sites.id', 'preceptor_sites.site_id')
					.select(['sites.id', 'sites.name'])
					.where('preceptor_sites.preceptor_id', '=', p.id as string)
					.execute();

				return {
					...p,
					sites: sites.map((s) => ({ id: s.id as string, name: s.name }))
				};
			})
		);

		return successResponse(preceptorsWithSites);
	} catch (error) {
		return handleApiError(error);
	}
};
