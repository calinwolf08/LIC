import { db } from '$lib/db';
import { siteService } from '$lib/features/sites/services/site-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [healthSystems, sites] = await Promise.all([
		db.selectFrom('health_systems').selectAll().execute(),
		siteService.getAllSites()
	]);

	const sitesWithHealthSystems = await Promise.all(
		sites.map(async (site) => {
			const healthSystem = await db
				.selectFrom('health_systems')
				.select('name')
				.where('id', '=', site.health_system_id)
				.executeTakeFirst();
			return { ...site, health_system_name: healthSystem?.name || 'Unknown' };
		})
	);

	return {
		healthSystems,
		sites: sitesWithHealthSystems
	};
};
