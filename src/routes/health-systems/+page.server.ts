import { db } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const healthSystems = await db.selectFrom('health_systems').selectAll().execute();

	return {
		healthSystems
	};
};
