/**
 * New Team Page Load Function
 *
 * Fetches clerkships, sites, and health systems for team creation
 */

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [clerkshipsRes, sitesRes, healthSystemsRes] = await Promise.all([
			fetch('/api/clerkships'),
			fetch('/api/sites'),
			fetch('/api/health-systems')
		]);

		const clerkshipsResult = clerkshipsRes.ok ? await clerkshipsRes.json() : { data: [] };
		const sitesResult = sitesRes.ok ? await sitesRes.json() : { data: [] };
		const healthSystemsResult = healthSystemsRes.ok ? await healthSystemsRes.json() : { data: [] };

		return {
			clerkships: (clerkshipsResult.data || []) as Array<{ id: string; name: string }>,
			sites: (sitesResult.data || []) as Array<{ id: string; name: string; health_system_id: string | null }>,
			healthSystems: (healthSystemsResult.data || []) as Array<{ id: string; name: string }>
		};
	} catch (error) {
		console.error('Error loading new team page data:', error);
		return {
			clerkships: [] as Array<{ id: string; name: string }>,
			sites: [] as Array<{ id: string; name: string; health_system_id: string | null }>,
			healthSystems: [] as Array<{ id: string; name: string }>
		};
	}
};
