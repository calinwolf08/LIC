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
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('api:preceptors:teams:available-preceptors');

/**
 * GET /api/preceptors/teams/available-preceptors
 * Returns preceptors filtered by site IDs
 * Query param: siteIds (comma-separated list of site IDs)
 */
export const GET: RequestHandler = async ({ url }) => {
	const siteIdsParam = url.searchParams.get('siteIds');
	const siteIds = siteIdsParam ? siteIdsParam.split(',').filter(Boolean) : [];

	log.debug('Fetching available preceptors', {
		siteIds,
		siteCount: siteIds.length
	});

	try {
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

		log.info('Available preceptors fetched', {
			count: preceptorsWithSites.length,
			siteCount: siteIds.length
		});

		return successResponse(preceptorsWithSites);
	} catch (error) {
		log.error('Failed to fetch available preceptors', { siteIds, error });
		return handleApiError(error);
	}
};
