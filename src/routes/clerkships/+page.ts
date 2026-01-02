/**
 * Clerkships Page Load Function
 *
 * Fetches all clerkships and sites from the API
 */

import type { PageLoad } from './$types';
import type { Clerkships, Sites } from '$lib/db/types';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const [clerkshipsRes, sitesRes] = await Promise.all([
			fetch('/api/clerkships'),
			fetch('/api/sites')
		]);

		if (!clerkshipsRes.ok) {
			throw new Error('Failed to fetch clerkships');
		}

		const clerkshipsResult = await clerkshipsRes.json();
		const sitesResult = sitesRes.ok ? await sitesRes.json() : { data: [] };

		return {
			clerkships: clerkshipsResult.data as Clerkships[],
			sites: (sitesResult.data || []) as Sites[]
		};
	} catch (error) {
		console.error('Error loading clerkships:', error);
		return {
			clerkships: [] as Clerkships[],
			sites: [] as Sites[]
		};
	}
};
