import { siteService } from '$lib/features/sites/services/site-service';
import { db } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const sites = await siteService.getAllSites();

	// Get health system names for each site
	const sitesWithHealthSystems = await Promise.all(
		sites.map(async (site) => {
			const healthSystem = await db
				.selectFrom('health_systems')
				.select('name')
				.where('id', '=', site.health_system_id)
				.executeTakeFirst();

			return {
				...site,
				health_system_name: healthSystem?.name || 'Unknown'
			};
		})
	);

	return {
		sites: sitesWithHealthSystems
	};
};
