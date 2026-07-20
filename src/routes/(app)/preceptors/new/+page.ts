/**
 * New Preceptor Wizard Page Load Function
 *
 * Fetches health systems and sites for preceptor creation
 */

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [healthSystemsRes, sitesRes] = await Promise.all([
			fetch('/api/health-systems'),
			fetch('/api/sites')
		]);

		const healthSystemsResult = healthSystemsRes.ok ? await healthSystemsRes.json() : { data: [] };
		const sitesResult = sitesRes.ok ? await sitesRes.json() : { data: [] };

		return {
			healthSystems: (healthSystemsResult.data || []) as Array<{ id: string; name: string }>,
			sites: (sitesResult.data || []) as Array<{ id: string; name: string; health_system_id: string | null }>
		};
	} catch (error) {
		console.error('Error loading new preceptor page data:', error);
		return {
			healthSystems: [] as Array<{ id: string; name: string }>,
			sites: [] as Array<{ id: string; name: string; health_system_id: string | null }>
		};
	}
};
