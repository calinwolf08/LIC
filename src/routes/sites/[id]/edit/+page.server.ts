import { siteService } from '$lib/features/sites/services/site-service';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const site = await siteService.getSiteById(params.id);

		const healthSystems = await db
			.selectFrom('health_systems')
			.select(['id', 'name'])
			.orderBy('name', 'asc')
			.execute();

		return {
			site,
			healthSystems
		};
	} catch (err) {
		throw error(404, 'Site not found');
	}
};
