/**
 * Preceptors Page Load Function
 *
 * Fetches all preceptors, health systems, sites, and clerkships from the API
 */

import type { PageLoad } from './$types';
import type { Preceptors } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [preceptorsRes, healthSystemsRes, sitesRes, clerkshipsRes] = await Promise.all([
			fetch('/api/preceptors'),
			fetch('/api/scheduling-config/health-systems'),
			fetch('/api/sites'),
			fetch('/api/clerkships')
		]);

		const preceptorsResult = preceptorsRes.ok ? await preceptorsRes.json() : { data: [] };
		const healthSystemsResult = healthSystemsRes.ok ? await healthSystemsRes.json() : { data: [] };
		const sitesResult = sitesRes.ok ? await sitesRes.json() : { data: [] };
		const clerkshipsResult = clerkshipsRes.ok ? await clerkshipsRes.json() : { data: [] };

		return {
			preceptors: (preceptorsResult.data || []) as Preceptors[],
			healthSystems: (healthSystemsResult.data || []) as Array<{ id: string; name: string }>,
			sites: (sitesResult.data || []) as Array<{ id: string; name: string; health_system_id: string | null }>,
			clerkships: (clerkshipsResult.data || []) as Array<{ id: string; name: string }>
		};
	} catch (error) {
		console.error('Error loading preceptors page data:', error);
		return {
			preceptors: [] as Preceptors[],
			healthSystems: [] as Array<{ id: string; name: string }>,
			sites: [] as Array<{ id: string; name: string; health_system_id: string | null }>,
			clerkships: [] as Array<{ id: string; name: string }>
		};
	}
};
