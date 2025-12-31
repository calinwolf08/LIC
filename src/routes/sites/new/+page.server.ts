import { db } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const healthSystems = await db
		.selectFrom('health_systems')
		.select(['id', 'name'])
		.orderBy('name', 'asc')
		.execute();

	return {
		healthSystems: healthSystems.map(hs => ({ id: hs.id!, name: hs.name }))
	};
};
